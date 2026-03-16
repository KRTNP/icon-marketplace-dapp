import useStore from "@/store/useStore";
import IconCard from "@/components/IconCard";
import { Package } from "lucide-react";

export default function MarketplaceGallery() {
  const items = useStore((s) => s.items);
  const contract = useStore((s) => s.contract);
  const dataLoading = useStore((s) => s.dataLoading);

  if (!contract) {
    return (
      <EmptyState
        title="Load Contract"
        description="Enter a contract address above to view the marketplace."
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
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

  if (items.length === 0) {
    return (
      <EmptyState
        title="No Icons Available"
        description="Be the first to add an icon to the marketplace."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <IconCard key={item.id} item={item} variant="marketplace" />
      ))}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Package className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
