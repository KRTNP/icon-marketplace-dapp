import { useState } from "react";
import { Button } from "@/components/ui/button";
import useStore from "@/store/useStore";
import { Loader2, Check, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

export default function IconCard({ item, variant = "marketplace" }) {
  const buyIcon = useStore((s) => s.buyIcon);
  const account = useStore((s) => s.account);
  const txPending = useStore((s) => s.txPending);
  const getDownloadUrl = useStore((s) => s.getDownloadUrl);

  const [buying, setBuying] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [loadingDownload, setLoadingDownload] = useState(false);

  const isOwnItem = account?.toLowerCase() === item.seller?.toLowerCase();
  const isPurchased = item.purchased;

  const handleBuy = async () => {
    setBuying(true);
    await buyIcon(item.id);
    setBuying(false);
  };

  const handleRevealDownload = async () => {
    setLoadingDownload(true);
    const url = await getDownloadUrl(item.id);
    setDownloadUrl(url);
    setLoadingDownload(false);
  };

  // Normalize preview URL
  const previewUrl = item.previewImageURL?.startsWith("http")
    ? item.previewImageURL
    : item.previewImageURL?.startsWith("/")
    ? item.previewImageURL
    : `/uploads/${item.previewImageURL}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200",
        "hover:shadow-md hover:border-foreground/20"
      )}
    >
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={previewUrl}
          alt={item.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            e.target.src = "/placeholder.svg?height=400&width=400";
          }}
        />

        {/* Overlay on hover for marketplace items */}
        {variant === "marketplace" && !isPurchased && !isOwnItem && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Button
              onClick={handleBuy}
              disabled={buying || txPending || !account}
              className="gap-2"
            >
              {buying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              Buy Now
            </Button>
          </div>
        )}

        {/* Status badges */}
        {isPurchased && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-green-500 px-2.5 py-1 text-xs font-medium text-white">
            <Check className="h-3 w-3" />
            Owned
          </div>
        )}
        {isOwnItem && !isPurchased && (
          <div className="absolute right-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background">
            Your Item
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-medium leading-tight text-foreground">
          {item.name}
        </h3>

        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-lg font-semibold">{item.priceEth}</span>
          <span className="text-sm text-muted-foreground">ETH</span>
        </div>

        {item.totalSales > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.totalSales} sale{item.totalSales !== 1 ? "s" : ""}
          </p>
        )}

        {/* Purchase view - reveal download */}
        {variant === "purchases" && (
          <div className="mt-4 space-y-2">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-foreground px-4 py-2 text-center text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Download Asset
              </a>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRevealDownload}
                disabled={loadingDownload}
                className="w-full gap-2"
              >
                {loadingDownload ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Reveal Download
              </Button>
            )}
          </div>
        )}

        {/* Marketplace view - buy button for mobile */}
        {variant === "marketplace" && !isPurchased && !isOwnItem && (
          <Button
            onClick={handleBuy}
            disabled={buying || txPending || !account}
            className="mt-4 w-full gap-2 md:hidden"
          >
            {buying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Buy for {item.priceEth} ETH
          </Button>
        )}
      </div>
    </article>
  );
}
