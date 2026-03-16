import { Button } from "@/components/ui/button";
import useStore from "@/store/useStore";
import { Wallet, LogOut, AlertCircle } from "lucide-react";

export default function Navbar() {
  const account = useStore((s) => s.account);
  const isLocalNetwork = useStore((s) => s.isLocalNetwork);
  const connectWallet = useStore((s) => s.connectWallet);
  const disconnectWallet = useStore((s) => s.disconnectWallet);
  const switchToLocalNetwork = useStore((s) => s.switchToLocalNetwork);

  const shortAccount = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "";

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground">
            <span className="text-sm font-bold text-background">IC</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Icon Marketplace
          </span>
        </div>

        <div className="flex items-center gap-3">
          {account && !isLocalNetwork && (
            <Button
              variant="outline"
              size="sm"
              onClick={switchToLocalNetwork}
              className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <AlertCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Switch Network</span>
            </Button>
          )}

          {account ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">{shortAccount}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={disconnectWallet}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </div>
          ) : (
            <Button onClick={connectWallet} className="gap-2">
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
