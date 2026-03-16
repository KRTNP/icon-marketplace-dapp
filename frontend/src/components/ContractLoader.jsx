import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useStore from "@/store/useStore";
import { RefreshCw, Loader2 } from "lucide-react";

export default function ContractLoader() {
  const contractAddress = useStore((s) => s.contractAddress);
  const setContractAddress = useStore((s) => s.setContractAddress);
  const loadContract = useStore((s) => s.loadContract);
  const loadAllData = useStore((s) => s.loadAllData);
  const contract = useStore((s) => s.contract);
  const dataLoading = useStore((s) => s.dataLoading);

  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    await loadContract(contractAddress);
    setLoading(false);
  };

  const handleRefresh = async () => {
    await loadAllData();
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="contract-address" className="text-muted-foreground">
        Contract Address
      </Label>
      <div className="flex gap-3">
        <Input
          id="contract-address"
          placeholder="0x..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          className="flex-1 font-mono text-sm"
        />
        <Button
          variant="secondary"
          onClick={handleLoad}
          disabled={loading || !contractAddress}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Load
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={!contract || dataLoading}
          title="Refresh marketplace data"
        >
          <RefreshCw
            className={cn("h-4 w-4", dataLoading && "animate-spin")}
          />
        </Button>
      </div>
    </div>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
