mod circuit;
mod mimc;
mod serialize;

use std::{fs, path::PathBuf};

use anyhow::{Context, Result};
use ark_bls12_381::{Bls12_381, Fr};
use ark_groth16::{Groth16, ProvingKey, VerifyingKey};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use clap::{Parser, Subcommand};
use rand::thread_rng;
use sha2::{Digest, Sha256};

use circuit::{compute_merkle_root, to_fr_native, WithdrawCircuit, TREE_DEPTH};
use mimc::compute_round_constants;
use serialize::{vk_to_register_circuit_json, withdrawal_payload_json};

//  CLI 

#[derive(Parser)]
#[command(name = "veilpool-prover", about = "VeilPool Groth16 withdrawal prover")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run a one-time trusted setup and write pk.bin + vk.bin
    Setup {
        #[arg(long, default_value = "prover-keys")]
        output_dir: PathBuf,
    },

    /// Generate a withdrawal proof from private inputs
    Prove {
        /// Deposit secret (32-byte hex)
        #[arg(long)]
        secret: String,
        /// Deposit nullifier (32-byte hex)
        #[arg(long)]
        nullifier: String,
        /// 20 Merkle sibling hashes as a JSON array of 32-byte hex strings (mutually exclusive with --path-elements-file)
        #[arg(long)]
        path_elements: Option<String>,
        /// File containing 20 Merkle sibling hashes as a JSON array (alternative to --path-elements)
        #[arg(long)]
        path_elements_file: Option<PathBuf>,
        /// 20 path indices as a JSON array of booleans (mutually exclusive with --path-indices-file)
        #[arg(long)]
        path_indices: Option<String>,
        /// File containing 20 path indices as a JSON array of booleans (alternative to --path-indices)
        #[arg(long)]
        path_indices_file: Option<PathBuf>,
        /// Merkle root (32-byte hex)
        #[arg(long)]
        root: String,
        /// Recipient address bytes (32-byte hex)
        #[arg(long)]
        recipient: String,
        /// Pool denomination (u64, e.g. 10000000 for 1 XLM)
        #[arg(long, default_value = "10000000")]
        denomination: u64,
        /// Path to proving key file (pk.bin)
        #[arg(long, default_value = "prover-keys/pk.bin")]
        pk: PathBuf,
        /// Circuit ID that was registered on-chain (32-byte hex)
        #[arg(long)]
        circuit_id: String,
        /// Privacy pool contract address
        #[arg(long, default_value = "")]
        pool_address: String,
        /// Prover's Stellar address
        #[arg(long, default_value = "")]
        prover_address: String,
        /// Output JSON file (default: stdout)
        #[arg(long)]
        output: Option<PathBuf>,
    },

    /// Format the verifying key for the `register_circuit` contract call
    FormatVk {
        /// Path to verifying key file (vk.bin)
        #[arg(long, default_value = "prover-keys/vk.bin")]
        vk: PathBuf,
        /// Circuit ID (32-byte hex)
        #[arg(long)]
        circuit_id: String,
        /// Human-readable circuit name stored on-chain
        #[arg(long, default_value = "veilpool_withdraw_v1")]
        circuit_name: String,
    },

    /// Compute the commitment for a (secret, nullifier) pair — off-chain helper
    Commitment {
        #[arg(long)]
        secret: String,
        #[arg(long)]
        nullifier: String,
    },

    /// Compute the nullifier hash to submit on-chain — off-chain helper
    NullifierHash {
        #[arg(long)]
        nullifier: String,
    },
}

//  Helpers 

fn parse_hex32(s: &str) -> Result<[u8; 32]> {
    let bytes = hex::decode(s.trim_start_matches("0x"))
        .with_context(|| format!("invalid hex: {s}"))?;
    bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("expected 32 bytes, got {}", s.len() / 2))
}

fn parse_hex32_array<const N: usize>(json: &str) -> Result<[[u8; 32]; N]> {
    let v: Vec<String> = serde_json::from_str(json)
        .with_context(|| "expected JSON array of hex strings")?;
    anyhow::ensure!(v.len() == N, "expected {N} elements, got {}", v.len());
    let mut out = [[0u8; 32]; N];
    for (i, s) in v.iter().enumerate() {
        out[i] = parse_hex32(s)?;
    }
    Ok(out)
}

fn parse_bool_array<const N: usize>(json: &str) -> Result<[bool; N]> {
    let v: Vec<bool> = serde_json::from_str(json)
        .with_context(|| "expected JSON array of booleans")?;
    anyhow::ensure!(v.len() == N, "expected {N} elements, got {}", v.len());
    let mut out = [false; N];
    out[..N].copy_from_slice(&v);
    Ok(out)
}

//  Subcommands 

fn cmd_setup(output_dir: &PathBuf) -> Result<()> {
    fs::create_dir_all(output_dir).with_context(|| "creating output directory")?;

    eprintln!("Generating Groth16 circuit structure for setup...");
    let circuit = WithdrawCircuit {
        secret:           None,
        nullifier:        None,
        path_elements:    None,
        path_indices:     None,
        root:             None,
        nullifier_hash:   None,
        recipient:        None,
        denomination:     None,
        protocol_version: None,
    };

    let mut rng = thread_rng();
    eprintln!("Running trusted setup (this may take a minute)...");
    let (pk, vk) = Groth16::<Bls12_381>::circuit_specific_setup(circuit, &mut rng)
        .map_err(|e| anyhow::anyhow!("setup failed: {e:?}"))?;

    let pk_path = output_dir.join("pk.bin");
    let vk_path = output_dir.join("vk.bin");

    let mut pk_file = fs::File::create(&pk_path)?;
    pk.serialize_uncompressed(&mut pk_file)?;
    eprintln!("Proving key  → {}", pk_path.display());

    let mut vk_file = fs::File::create(&vk_path)?;
    vk.serialize_uncompressed(&mut vk_file)?;
    eprintln!("Verifying key → {}", vk_path.display());

    println!("Setup complete. Run `format-vk` to get the register_circuit payload.");
    Ok(())
}

fn resolve_json_arg(
    inline: Option<&String>,
    file: Option<&PathBuf>,
    name: &str,
) -> Result<String> {
    match (inline, file) {
        (Some(_), Some(_)) => anyhow::bail!("--{name} and --{name}-file are mutually exclusive"),
        (Some(s), None) => Ok(s.clone()),
        (None, Some(p)) => fs::read_to_string(p)
            .with_context(|| format!("reading --{name}-file {}", p.display())),
        (None, None) => anyhow::bail!("one of --{name} or --{name}-file is required"),
    }
}

fn cmd_prove(
    secret_hex:         &str,
    nullifier_hex:      &str,
    path_elements_arg:  Option<&String>,
    path_elements_file: Option<&PathBuf>,
    path_indices_arg:   Option<&String>,
    path_indices_file:  Option<&PathBuf>,
    root_hex:           &str,
    recipient_hex:      &str,
    denomination:       u64,
    pk_path:            &PathBuf,
    circuit_id_hex:     &str,
    pool_address:       &str,
    prover_address:     &str,
    output:             &Option<PathBuf>,
) -> Result<()> {
    let secret        = parse_hex32(secret_hex)?;
    let nullifier     = parse_hex32(nullifier_hex)?;
    let path_elements_json = resolve_json_arg(path_elements_arg, path_elements_file, "path-elements")?;
    let path_indices_json  = resolve_json_arg(path_indices_arg, path_indices_file, "path-indices")?;
    let path_elements = parse_hex32_array::<TREE_DEPTH>(&path_elements_json)?;
    let path_indices  = parse_bool_array::<TREE_DEPTH>(&path_indices_json)?;
    let root_bytes    = parse_hex32(root_hex)?;
    let recipient_bytes = parse_hex32(recipient_hex)?;
    let circuit_id    = parse_hex32(circuit_id_hex)?;

    // Derive public inputs
    let consts            = compute_round_constants();
    let leaf_bytes        = Sha256::digest([&secret[..], &nullifier[..]].concat());
    let leaf_arr: [u8; 32] = leaf_bytes.into();
    let leaf_fr           = to_fr_native(&leaf_arr);

    let computed_root = compute_merkle_root(leaf_fr, &path_elements, &path_indices, &consts);
    let root_fr       = to_fr_native(&root_bytes);
    anyhow::ensure!(
        computed_root == root_fr,
        "computed Merkle root does not match the provided root — check path_elements / path_indices"
    );

    let null_hash_bytes: [u8; 32] = Sha256::digest(&nullifier).into();
    let nullifier_hash_fr = to_fr_native(&null_hash_bytes);
    let recipient_fr      = to_fr_native(&recipient_bytes);
    let denomination_fr   = Fr::from(denomination);
    let protocol_ver_fr   = Fr::from(1u64);

    let circuit = WithdrawCircuit {
        secret:           Some(secret),
        nullifier:        Some(nullifier),
        path_elements:    Some(path_elements),
        path_indices:     Some(path_indices),
        root:             Some(root_fr),
        nullifier_hash:   Some(nullifier_hash_fr),
        recipient:        Some(recipient_fr),
        denomination:     Some(denomination_fr),
        protocol_version: Some(protocol_ver_fr),
    };

    eprintln!("Loading proving key...");
    let pk_bytes = fs::read(pk_path).with_context(|| format!("reading {}", pk_path.display()))?;
    let pk = ProvingKey::<Bls12_381>::deserialize_uncompressed(&pk_bytes[..])
        .map_err(|e| anyhow::anyhow!("deserializing pk: {e:?}"))?;

    eprintln!("Generating proof...");
    let mut rng = thread_rng();
    let proof = Groth16::<Bls12_381>::prove(&pk, circuit, &mut rng)
        .map_err(|e| anyhow::anyhow!("proving failed: {e:?}"))?;

    let public_inputs: [Fr; 5] = [
        root_fr,
        nullifier_hash_fr,
        recipient_fr,
        denomination_fr,
        protocol_ver_fr,
    ];

    // Quick local verify
    let pvk = Groth16::<Bls12_381>::process_vk(&pk.vk)
        .map_err(|e| anyhow::anyhow!("process_vk: {e:?}"))?;
    let valid = Groth16::<Bls12_381>::verify_with_processed_vk(&pvk, &public_inputs, &proof)
        .map_err(|e| anyhow::anyhow!("verify: {e:?}"))?;
    anyhow::ensure!(valid, "local proof verification failed — this is a bug");
    eprintln!("Local proof verified ✓");

    let payload = withdrawal_payload_json(
        &proof,
        &public_inputs,
        &circuit_id,
        pool_address,
        prover_address,
    );

    let json_str = serde_json::to_string_pretty(&payload)?;
    match output {
        Some(path) => {
            fs::write(path, &json_str)?;
            eprintln!("Proof written to {}", path.display());
        }
        None => println!("{json_str}"),
    }
    Ok(())
}

fn cmd_format_vk(vk_path: &PathBuf, circuit_id_hex: &str, circuit_name: &str) -> Result<()> {
    let circuit_id = parse_hex32(circuit_id_hex)?;
    let vk_bytes   = fs::read(vk_path).with_context(|| format!("reading {}", vk_path.display()))?;
    let vk = VerifyingKey::<Bls12_381>::deserialize_uncompressed(&vk_bytes[..])
        .map_err(|e| anyhow::anyhow!("deserializing vk: {e:?}"))?;

    let json = vk_to_register_circuit_json(&vk, &circuit_id, circuit_name);
    println!("{}", serde_json::to_string_pretty(&json)?);
    Ok(())
}

fn cmd_commitment(secret_hex: &str, nullifier_hex: &str) -> Result<()> {
    let secret   = parse_hex32(secret_hex)?;
    let nullifier = parse_hex32(nullifier_hex)?;
    let hash: [u8; 32] = Sha256::digest([&secret[..], &nullifier[..]].concat()).into();
    println!("{}", hex::encode(hash));
    Ok(())
}

fn cmd_nullifier_hash(nullifier_hex: &str) -> Result<()> {
    let nullifier = parse_hex32(nullifier_hex)?;
    let hash: [u8; 32] = Sha256::digest(&nullifier).into();
    // Apply to_fr zeroing: zero byte[0]
    let mut fr_bytes = hash;
    fr_bytes[0] = 0x00;
    println!("{}", hex::encode(fr_bytes));
    Ok(())
}

//  Entry point 

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Setup { output_dir } => cmd_setup(&output_dir),

        Commands::Prove {
            secret,
            nullifier,
            path_elements,
            path_elements_file,
            path_indices,
            path_indices_file,
            root,
            recipient,
            denomination,
            pk,
            circuit_id,
            pool_address,
            prover_address,
            output,
        } => cmd_prove(
            &secret,
            &nullifier,
            path_elements.as_ref(),
            path_elements_file.as_ref(),
            path_indices.as_ref(),
            path_indices_file.as_ref(),
            &root,
            &recipient,
            denomination,
            &pk,
            &circuit_id,
            &pool_address,
            &prover_address,
            &output,
        ),

        Commands::FormatVk { vk, circuit_id, circuit_name } => {
            cmd_format_vk(&vk, &circuit_id, &circuit_name)
        }

        Commands::Commitment { secret, nullifier } => cmd_commitment(&secret, &nullifier),

        Commands::NullifierHash { nullifier } => cmd_nullifier_hash(&nullifier),
    }
}
