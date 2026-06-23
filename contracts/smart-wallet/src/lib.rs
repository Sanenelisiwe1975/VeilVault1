//! Smart Wallet — Passkey-based Custom Account
//!
//! A Soroban custom account (https://developers.stellar.org/docs/learn/encyclopedia/security/authorization#account-abstraction)
//! that authorizes transactions using a WebAuthn / passkey signature instead
//! of a classic Stellar Ed25519 keypair. This is the account-abstraction
//! sign-in option: a user registers a passkey (Face ID / fingerprint /
//! Windows Hello) once, the backend deploys one of these contracts for them
//! with the passkey's public key, and from then on `Address::require_auth()`
//! on this contract's address is satisfied by a fresh WebAuthn assertion —
//! no seed phrase, no browser extension.
//!
//! # How verification works
//! Soroban calls `__check_auth(signature_payload, signature, auth_contexts)`
//! whenever this contract's address needs to authorize something.
//! `signature_payload` is a 32-byte hash chosen by the network. We require
//! the client to have obtained a WebAuthn assertion whose `clientDataJSON`
//! embeds that exact hash (base64url-encoded) as the `challenge` field —
//! this is exactly what `navigator.credentials.get({ challenge })` does when
//! the backend passes `signature_payload` as the challenge. We then:
//!   1. Recompute the WebAuthn signed digest:
//!      `SHA256(authenticatorData || SHA256(clientDataJSON))`
//!   2. Verify the secp256r1 signature over that digest with the stored
//!      passkey public key (native Soroban host function — no extra crate).
//!   3. Confirm `clientDataJSON` contains `"challenge":"<base64url(signature_payload)>"`
//!      and `"type":"webauthn.get"`, and that the authenticator's User
//!      Present flag is set.
//!
//! No on-chain JSON parser is needed — `clientDataJSON` is a small, known
//! shape, so a byte substring search for the expected challenge/type fields
//! is sufficient and avoids pulling in a no_std JSON crate.
//!
//! # Multiple signers (recovery)
//! A wallet isn't limited to one passkey. `add_signer` / `remove_signer` let
//! a user register a backup passkey (a second device, or a recovery
//! authenticator kept somewhere safe) so losing one device doesn't mean
//! losing the wallet. Both require the wallet's own `require_auth()` —
//! satisfied by a WebAuthn assertion from an *already-registered* signer —
//! so only someone who already controls the wallet can add or remove a
//! signer. `WebAuthnSignature::signer_index` tells `__check_auth` which
//! registered key the assertion claims to be signed by (the contract can't
//! try every key in turn: `secp256r1_verify` traps on mismatch instead of
//! returning a bool, so there's no cheap way to "try them all").
#![no_std]
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    Address, Bytes, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    AlreadyInitialized   = 1,
    NotInitialized        = 2,
    InvalidPublicKey       = 3,
    ChallengeMismatch       = 4,
    NotWebAuthnGet           = 5,
    UserNotPresent            = 6,
    InvalidSignerIndex          = 7,
    SignerAlreadyExists           = 8,
    TooManySigners                  = 9,
    CannotRemoveLastSigner            = 10,
}

#[contracttype]
pub enum DataKey {
    Signers,
}

/// A WebAuthn assertion, passed as the `Signature` associated type for
/// `CustomAccountInterface`.
///
/// IMPORTANT for callers building this struct off-chain: browsers return the
/// raw signature DER-encoded, and the `s` component is not guaranteed to be
/// in low-S form. Soroban's `secp256r1_verify` rejects non-low-S signatures
/// outright (`Error(Crypto, InvalidInput)`), so the relaying code (backend)
/// MUST: (1) decode the DER signature to raw 64-byte (r || s), and
/// (2) normalize s to low-S (s > n/2 ? n - s : s) before submitting here.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WebAuthnSignature {
    /// Index into the wallet's registered signers list (`get_signers`) that
    /// this assertion claims to be signed by.
    pub signer_index: u32,
    /// Raw `authenticatorData` from the assertion.
    pub authenticator_data: Bytes,
    /// Raw `clientDataJSON` from the assertion (UTF-8 JSON bytes).
    pub client_data_json: Bytes,
    /// Raw 64-byte (r || s) ECDSA signature, low-S normalized — not DER-encoded.
    pub signature: BytesN<64>,
}

const FLAG_USER_PRESENT: u8 = 0x01;
const MAX_SIGNERS: u32 = 5;

#[contract]
pub struct SmartWalletContract;

#[contractimpl]
impl SmartWalletContract {
    /// One-time setup: bind this wallet contract to a passkey's SEC1
    /// uncompressed public key (0x04 || X(32) || Y(32), 65 bytes total) as
    /// its first (and initially only) signer.
    ///
    /// `deployer` must be the same address that paid for `createCustomContract`
    /// and must sign this call. Without this check, anyone watching the
    /// network could race the legitimate deployer's follow-up `initialize`
    /// call and bind the wallet to their own public key instead.
    pub fn initialize(env: Env, deployer: Address, public_key: BytesN<65>) -> Result<(), WalletError> {
        if env.storage().instance().has(&DataKey::Signers) {
            return Err(WalletError::AlreadyInitialized);
        }
        deployer.require_auth();
        validate_signer_key(&public_key)?;

        let mut signers = Vec::new(&env);
        signers.push_back(public_key);
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage().instance().extend_ttl(1_000_000, 1_000_000);
        Ok(())
    }

    pub fn get_signers(env: Env) -> Result<Vec<BytesN<65>>, WalletError> {
        env.storage()
            .instance()
            .get(&DataKey::Signers)
            .ok_or(WalletError::NotInitialized)
    }

    /// Register a backup passkey. Requires the wallet's own auth — i.e. a
    /// valid WebAuthn assertion from a signer that's already registered —
    /// so only someone who already controls the wallet can add another key.
    pub fn add_signer(env: Env, new_signer: BytesN<65>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        validate_signer_key(&new_signer)?;

        let mut signers: Vec<BytesN<65>> = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .ok_or(WalletError::NotInitialized)?;

        if signers.iter().any(|s| s == new_signer) {
            return Err(WalletError::SignerAlreadyExists);
        }
        if signers.len() >= MAX_SIGNERS {
            return Err(WalletError::TooManySigners);
        }

        signers.push_back(new_signer);
        env.storage().instance().set(&DataKey::Signers, &signers);
        Ok(())
    }

    /// Remove a signer by index (see `get_signers`). Same auth requirement
    /// as `add_signer`. Always leaves at least one signer — a wallet can
    /// never be left with zero ways to authorize itself.
    pub fn remove_signer(env: Env, signer_index: u32) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();

        let mut signers: Vec<BytesN<65>> = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .ok_or(WalletError::NotInitialized)?;

        if signer_index >= signers.len() {
            return Err(WalletError::InvalidSignerIndex);
        }
        if signers.len() <= 1 {
            return Err(WalletError::CannotRemoveLastSigner);
        }

        signers.remove(signer_index);
        env.storage().instance().set(&DataKey::Signers, &signers);
        Ok(())
    }
}

#[contractimpl]
impl CustomAccountInterface for SmartWalletContract {
    type Signature = WebAuthnSignature;
    type Error = WalletError;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: WebAuthnSignature,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), WalletError> {
        let signers: Vec<BytesN<65>> = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .ok_or(WalletError::NotInitialized)?;
        let public_key = signers
            .get(signature.signer_index)
            .ok_or(WalletError::InvalidSignerIndex)?;

        // 1. The authenticator must report the user was present for this assertion.
        let auth_data_len = signature.authenticator_data.len();
        if auth_data_len < 33 {
            return Err(WalletError::UserNotPresent);
        }
        let flags = signature.authenticator_data.get(32).unwrap_or(0);
        if flags & FLAG_USER_PRESENT == 0 {
            return Err(WalletError::UserNotPresent);
        }

        // 2. clientDataJSON must be a real "webauthn.get" assertion...
        if !contains_subsequence(&signature.client_data_json, &json_field(&env, b"\"type\":\"webauthn.get\"")) {
            return Err(WalletError::NotWebAuthnGet);
        }

        // 3. ...over exactly this signature_payload (anti-replay / anti-substitution).
        let challenge_b64 = base64url_encode(&env, &signature_payload.to_bytes().to_array());
        let mut needle = Bytes::from_slice(&env, b"\"challenge\":\"");
        needle.append(&challenge_b64);
        needle.append(&Bytes::from_slice(&env, b"\""));
        if !contains_subsequence(&signature.client_data_json, &needle) {
            return Err(WalletError::ChallengeMismatch);
        }

        // 4. Recompute the WebAuthn signed digest and verify the passkey signature.
        let client_data_hash = env.crypto().sha256(&signature.client_data_json);
        let mut signed_data = signature.authenticator_data.clone();
        signed_data.append(&Bytes::from(client_data_hash.to_bytes()));
        let digest = env.crypto().sha256(&signed_data);

        // Traps (aborts the transaction) if the signature is invalid — this
        // is the same convention Soroban uses for its own native Ed25519
        // account signature checks.
        env.crypto().secp256r1_verify(&public_key, &digest, &signature.signature);

        Ok(())
    }
}

// ── Helpers (no_std, no extra crates) ──────────────────────────────────────

fn validate_signer_key(public_key: &BytesN<65>) -> Result<(), WalletError> {
    if public_key.to_array()[0] != 0x04 {
        return Err(WalletError::InvalidPublicKey);
    }
    Ok(())
}

fn json_field(env: &Env, literal: &[u8]) -> Bytes {
    Bytes::from_slice(env, literal)
}

/// Naive O(n*m) substring search — clientDataJSON is always small (~100-250
/// bytes), so this comfortably fits the contract's CPU/budget limits.
fn contains_subsequence(haystack: &Bytes, needle: &Bytes) -> bool {
    let h_len = haystack.len();
    let n_len = needle.len();
    if n_len == 0 || n_len > h_len {
        return false;
    }
    let mut i = 0u32;
    while i + n_len <= h_len {
        let mut matched = true;
        let mut j = 0u32;
        while j < n_len {
            if haystack.get(i + j) != needle.get(j) {
                matched = false;
                break;
            }
            j += 1;
        }
        if matched {
            return true;
        }
        i += 1;
    }
    false
}

const B64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Base64url (no padding) encoding of a 32-byte buffer, matching how a
/// browser encodes the WebAuthn `challenge` it was given.
fn base64url_encode(env: &Env, input: &[u8; 32]) -> Bytes {
    let mut out = Bytes::new(env);
    let mut i = 0usize;
    while i + 3 <= input.len() {
        let b0 = input[i];
        let b1 = input[i + 1];
        let b2 = input[i + 2];
        out.push_back(B64_ALPHABET[(b0 >> 2) as usize]);
        out.push_back(B64_ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize]);
        out.push_back(B64_ALPHABET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize]);
        out.push_back(B64_ALPHABET[(b2 & 0x3f) as usize]);
        i += 3;
    }
    let remainder = input.len() - i;
    if remainder == 2 {
        let b0 = input[i];
        let b1 = input[i + 1];
        out.push_back(B64_ALPHABET[(b0 >> 2) as usize]);
        out.push_back(B64_ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize]);
        out.push_back(B64_ALPHABET[((b1 & 0x0f) << 2) as usize]);
    } else if remainder == 1 {
        let b0 = input[i];
        out.push_back(B64_ALPHABET[(b0 >> 2) as usize]);
        out.push_back(B64_ALPHABET[((b0 & 0x03) << 4) as usize]);
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;
    use p256::ecdsa::signature::hazmat::PrehashSigner;
    use p256::ecdsa::{Signature, SigningKey};
    use rand_core::OsRng;
    use sha2::{Digest, Sha256};
    use soroban_sdk::testutils::Address as _;
    use std::string::String;

    struct Fixture {
        env: Env,
        signing_keys: std::vec::Vec<SigningKey>,
        client: SmartWalletContractClient<'static>,
        deployer: Address,
    }

    fn new_p256_keypair(env: &Env) -> (SigningKey, BytesN<65>) {
        let signing_key = SigningKey::random(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        let point = verifying_key.to_encoded_point(false);
        let pub_bytes: [u8; 65] = point.as_bytes().try_into().unwrap();
        (signing_key, BytesN::from_array(env, &pub_bytes))
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let (signing_key, public_key) = new_p256_keypair(&env);
        let deployer = Address::generate(&env);

        let contract_id = env.register(SmartWalletContract, ());
        let client: SmartWalletContractClient<'static> =
            unsafe { core::mem::transmute(SmartWalletContractClient::new(&env, &contract_id)) };
        client.initialize(&deployer, &public_key);

        Fixture { env, signing_keys: std::vec![signing_key], client, deployer }
    }

    /// Builds a real WebAuthn-shaped assertion over `challenge_payload`,
    /// signed with the fixture's signer at `signer_index`.
    fn make_assertion(f: &Fixture, signer_index: u32, challenge_payload: &[u8; 32], flags: u8) -> WebAuthnSignature {
        let challenge_b64 = std_base64url(challenge_payload);
        let client_data_json = alloc_format(&challenge_b64, true);

        // authenticatorData: 32-byte RP ID hash + 1 flags byte + 4-byte counter
        let mut authenticator_data = [0u8; 37];
        authenticator_data[32] = flags;

        let mut hasher = Sha256::new();
        hasher.update(client_data_json.as_bytes());
        let client_data_hash = hasher.finalize();

        let mut signed_data = authenticator_data.to_vec();
        signed_data.extend_from_slice(&client_data_hash);
        let digest: [u8; 32] = Sha256::digest(&signed_data).into();

        // Soroban's secp256r1_verify requires strict low-S normalized
        // signatures; raw ECDSA output (and real WebAuthn authenticators)
        // are not guaranteed to be low-S, so callers must normalize.
        let signing_key = &f.signing_keys[signer_index as usize];
        let sig: Signature = signing_key.sign_prehash(&digest).unwrap();
        let sig = sig.normalize_s().unwrap_or(sig);
        let sig_bytes: [u8; 64] = sig.to_bytes().into();

        WebAuthnSignature {
            signer_index,
            authenticator_data: Bytes::from_slice(&f.env, &authenticator_data),
            client_data_json: Bytes::from_slice(&f.env, client_data_json.as_bytes()),
            signature: BytesN::from_array(&f.env, &sig_bytes),
        }
    }

    // Test-only mirror of the contract's base64url encoder (std String, not Bytes).
    fn std_base64url(input: &[u8; 32]) -> String {
        const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        let mut i = 0usize;
        while i + 3 <= input.len() {
            let b0 = input[i]; let b1 = input[i + 1]; let b2 = input[i + 2];
            out.push(ALPHABET[(b0 >> 2) as usize] as char);
            out.push(ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
            out.push(ALPHABET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
            out.push(ALPHABET[(b2 & 0x3f) as usize] as char);
            i += 3;
        }
        let remainder = input.len() - i;
        if remainder == 2 {
            let b0 = input[i]; let b1 = input[i + 1];
            out.push(ALPHABET[(b0 >> 2) as usize] as char);
            out.push(ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
            out.push(ALPHABET[((b1 & 0x0f) << 2) as usize] as char);
        }
        out
    }

    fn alloc_format(challenge_b64: &str, webauthn_get: bool) -> String {
        let type_str = if webauthn_get { "webauthn.get" } else { "webauthn.create" };
        std::format!(
            "{{\"type\":\"{}\",\"challenge\":\"{}\",\"origin\":\"https://veil-vault1.vercel.app\"}}",
            type_str, challenge_b64
        )
    }

    /// Real `Hash<32>` values can only be produced via the host's own hash
    /// functions (the SDK doesn't expose a public raw constructor), so tests
    /// treat `sha256(seed)` as the network-chosen `signature_payload`.
    fn payload_hash(env: &Env, seed: &[u8]) -> Hash<32> {
        env.crypto().sha256(&Bytes::from_slice(env, seed))
    }

    #[test]
    fn test_valid_assertion_passes() {
        let f = setup();
        let hash = payload_hash(&f.env, b"login-1");
        let payload_bytes = hash.to_bytes().to_array();
        let sig = make_assertion(&f, 0, &payload_bytes, FLAG_USER_PRESENT);
        f.env.as_contract(&f.client.address, || {
            SmartWalletContract::__check_auth(f.env.clone(), hash, sig, Vec::new(&f.env)).unwrap();
        });
    }

    #[test]
    fn test_wrong_challenge_rejected() {
        let f = setup();
        let signed_hash = payload_hash(&f.env, b"login-1");
        let signed_bytes = signed_hash.to_bytes().to_array();
        let sig = make_assertion(&f, 0, &signed_bytes, FLAG_USER_PRESENT);
        // Soroban presents a different signature_payload than what was actually signed.
        let actual_hash = payload_hash(&f.env, b"login-2");
        f.env.as_contract(&f.client.address, || {
            let result = SmartWalletContract::__check_auth(f.env.clone(), actual_hash, sig, Vec::new(&f.env));
            assert_eq!(result, Err(WalletError::ChallengeMismatch));
        });
    }

    #[test]
    fn test_missing_user_present_flag_rejected() {
        let f = setup();
        let hash = payload_hash(&f.env, b"login-3");
        let payload_bytes = hash.to_bytes().to_array();
        let sig = make_assertion(&f, 0, &payload_bytes, 0); // no flags set
        f.env.as_contract(&f.client.address, || {
            let result = SmartWalletContract::__check_auth(f.env.clone(), hash, sig, Vec::new(&f.env));
            assert_eq!(result, Err(WalletError::UserNotPresent));
        });
    }

    #[test]
    fn test_double_initialize_fails() {
        let f = setup();
        let signers = f.client.get_signers();
        let result = f.client.try_initialize(&f.deployer, &signers.get(0).unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_public_key_prefix_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let deployer = Address::generate(&env);
        let mut bad = [0u8; 65];
        bad[0] = 0x02; // compressed-point prefix, not supported
        let contract_id = env.register(SmartWalletContract, ());
        let client: SmartWalletContractClient<'static> =
            unsafe { core::mem::transmute(SmartWalletContractClient::new(&env, &contract_id)) };
        let result = client.try_initialize(&deployer, &BytesN::from_array(&env, &bad));
        assert!(result.is_err());
    }

    // ── Multi-signer / recovery ─────────────────────────────────────────────

    #[test]
    fn test_add_signer_then_auth_with_backup_key() {
        let mut f = setup();
        let (backup_key, backup_pubkey) = new_p256_keypair(&f.env);
        f.client.add_signer(&backup_pubkey);
        f.signing_keys.push(backup_key);

        assert_eq!(f.client.get_signers().len(), 2);

        // The backup key (signer_index 1) can authorize on its own.
        let hash = payload_hash(&f.env, b"login-backup");
        let payload_bytes = hash.to_bytes().to_array();
        let sig = make_assertion(&f, 1, &payload_bytes, FLAG_USER_PRESENT);
        f.env.as_contract(&f.client.address, || {
            SmartWalletContract::__check_auth(f.env.clone(), hash, sig, Vec::new(&f.env)).unwrap();
        });
    }

    #[test]
    fn test_original_signer_still_works_after_adding_backup() {
        let mut f = setup();
        let (backup_key, backup_pubkey) = new_p256_keypair(&f.env);
        f.client.add_signer(&backup_pubkey);
        f.signing_keys.push(backup_key);

        let hash = payload_hash(&f.env, b"login-original");
        let payload_bytes = hash.to_bytes().to_array();
        let sig = make_assertion(&f, 0, &payload_bytes, FLAG_USER_PRESENT);
        f.env.as_contract(&f.client.address, || {
            SmartWalletContract::__check_auth(f.env.clone(), hash, sig, Vec::new(&f.env)).unwrap();
        });
    }

    #[test]
    fn test_duplicate_signer_rejected() {
        let f = setup();
        let signers = f.client.get_signers();
        let existing = signers.get(0).unwrap();
        let result = f.client.try_add_signer(&existing);
        assert_eq!(result, Err(Ok(WalletError::SignerAlreadyExists)));
    }

    #[test]
    fn test_too_many_signers_rejected() {
        let f = setup();
        for _ in 0..(MAX_SIGNERS - 1) {
            let (_, pubkey) = new_p256_keypair(&f.env);
            f.client.add_signer(&pubkey);
        }
        assert_eq!(f.client.get_signers().len(), MAX_SIGNERS);

        let (_, one_too_many) = new_p256_keypair(&f.env);
        let result = f.client.try_add_signer(&one_too_many);
        assert_eq!(result, Err(Ok(WalletError::TooManySigners)));
    }

    #[test]
    fn test_remove_signer() {
        let f = setup();
        let (_, backup_pubkey) = new_p256_keypair(&f.env);
        f.client.add_signer(&backup_pubkey);
        assert_eq!(f.client.get_signers().len(), 2);

        f.client.remove_signer(&1);
        assert_eq!(f.client.get_signers().len(), 1);
    }

    #[test]
    fn test_cannot_remove_last_signer() {
        let f = setup();
        let result = f.client.try_remove_signer(&0);
        assert_eq!(result, Err(Ok(WalletError::CannotRemoveLastSigner)));
    }

    #[test]
    fn test_invalid_signer_index_in_assertion_rejected() {
        let f = setup();
        let hash = payload_hash(&f.env, b"login-bad-index");
        let payload_bytes = hash.to_bytes().to_array();
        let mut sig = make_assertion(&f, 0, &payload_bytes, FLAG_USER_PRESENT);
        sig.signer_index = 7; // out of range — only index 0 exists
        f.env.as_contract(&f.client.address, || {
            let result = SmartWalletContract::__check_auth(f.env.clone(), hash, sig, Vec::new(&f.env));
            assert_eq!(result, Err(WalletError::InvalidSignerIndex));
        });
    }
}
