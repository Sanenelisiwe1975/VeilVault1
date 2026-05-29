import { FC, ReactNode, ComponentType, useMemo } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

const NETWORK = WalletAdapterNetwork.Devnet;
const ENDPOINT = clusterApiUrl(NETWORK);

// Cast to avoid React 18 FC type incompatibility with React 19's stricter JSX checker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Conn  = ConnectionProvider  as ComponentType<{ endpoint: string; children: ReactNode }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Wall  = WalletProvider      as ComponentType<{ wallets: any[]; autoConnect: boolean; children: ReactNode }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Modal = WalletModalProvider as ComponentType<{ children: ReactNode }>;

interface Props { children: ReactNode }

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: NETWORK }),
    ],
    []
  );

  return (
    <Conn endpoint={ENDPOINT}>
      <Wall wallets={wallets} autoConnect>
        <Modal>
          {children}
        </Modal>
      </Wall>
    </Conn>
  );
};
