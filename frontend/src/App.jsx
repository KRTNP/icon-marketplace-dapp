import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import StatusBar from "@/components/StatusBar";
import ContractLoader from "@/components/ContractLoader";
import MarketplaceGallery from "@/components/MarketplaceGallery";
import MyPurchases from "@/components/MyPurchases";
import AddIconModal from "@/components/AddIconModal";
import useStore from "@/store/useStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

export default function App() {
  const restoreSession = useStore((s) => s.restoreSession);
  const canTransact = useStore((s) => s.canTransact);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="space-y-8">
          {/* Contract Loader Section */}
          <section className="rounded-lg border bg-card p-6">
            <ContractLoader />
            <div className="mt-4">
              <StatusBar />
            </div>
          </section>

          {/* Main Content with Tabs */}
          <Tabs defaultValue="marketplace" className="space-y-6">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
                <TabsTrigger value="purchases">My Purchases</TabsTrigger>
              </TabsList>

              <Button
                onClick={() => setAddModalOpen(true)}
                disabled={!canTransact()}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Icon
              </Button>
            </div>

            <TabsContent value="marketplace" className="m-0">
              <MarketplaceGallery />
            </TabsContent>

            <TabsContent value="purchases" className="m-0">
              <MyPurchases />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <AddIconModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  );
}
