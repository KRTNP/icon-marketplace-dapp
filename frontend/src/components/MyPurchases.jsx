import useStore from "@/store/useStore";
import IconCard from "@/components/IconCard";
import { ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MyPurchases() {
  const purchases = useStore((s) => s.purchases);
  const account = useStore((s) => s.account);
  const contract = useStore((s) => s.contract);
  const dataLoading = useStore((s) => s.dataLoading);
  const connectWallet = useStore((s) => s.connectWallet);

  if (!account) {
    return (
      <EmptyState
        icon={<Wallet className="h-6 w-6 text-muted-foreground" />}
        title="Connect Your Wallet"
        description="Connect your wallet to view your purchased icons."
        action={
          <Button onClick={connectWallet} className="mt-4">
            Connect Wallet
          </Button>
        }
      />
    );
  }

  if (!contract) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6 text-muted-foreground" />}
        title="Load Contract"
        description="Load the contract to view your purchases."
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square rounded-lg bg-muted" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-5 w-1/4 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6 text-muted-foreground" />}
        title="No Purchases Yet"
        description="Icons you purchase will appear here. Browse the marketplace to find icons you like."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {purchases.length} item{purchases.length !== 1 ? "s" : ""} purchased
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {purchases.map((item) => (
          <IconCard key={item.id} item={item} variant="purchases" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
