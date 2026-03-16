import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useStore from "@/store/useStore";
import { Loader2, Upload, Link } from "lucide-react";

export default function AddIconModal({ open, onOpenChange }) {
  const addIcon = useStore((s) => s.addIcon);
  const encryptURL = useStore((s) => s.encryptURL);
  const uploadPreviewImage = useStore((s) => s.uploadPreviewImage);
  const uploadAssetFile = useStore((s) => s.uploadAssetFile);
  const setStatus = useStore((s) => s.setStatus);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  // Preview image state
  const [previewMode, setPreviewMode] = useState("url");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFile, setPreviewFile] = useState(null);

  // Asset state
  const [assetMode, setAssetMode] = useState("url");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetFile, setAssetFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setPrice("");
    setPreviewMode("url");
    setPreviewUrl("");
    setPreviewFile(null);
    setAssetMode("url");
    setAssetUrl("");
    setAssetFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setStatus("Please enter an icon name", "error");
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      setStatus("Please enter a valid price", "error");
      return;
    }

    setSubmitting(true);

    try {
      // Handle preview image
      let finalPreviewUrl;
      if (previewMode === "file" && previewFile) {
        finalPreviewUrl = await uploadPreviewImage(previewFile);
      } else if (previewMode === "url" && previewUrl.trim()) {
        finalPreviewUrl = previewUrl.trim();
      } else {
        setStatus("Please provide a preview image", "error");
        setSubmitting(false);
        return;
      }

      // Handle asset
      let encryptedAssetUrl;
      if (assetMode === "file" && assetFile) {
        encryptedAssetUrl = await uploadAssetFile(assetFile);
      } else if (assetMode === "url" && assetUrl.trim()) {
        encryptedAssetUrl = await encryptURL(assetUrl.trim());
      } else {
        setStatus("Please provide a download asset", "error");
        setSubmitting(false);
        return;
      }

      const success = await addIcon(
        name.trim(),
        price,
        encryptedAssetUrl,
        finalPreviewUrl
      );

      if (success) {
        resetForm();
        onOpenChange(false);
      }
    } catch (error) {
      setStatus(error.message || "Failed to add icon", "error");
    }

    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Icon</DialogTitle>
          <DialogDescription>
            List a new icon for sale on the marketplace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="icon-name">Icon Name</Label>
              <Input
                id="icon-name"
                placeholder="e.g. Apple Icon Pack"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon-price">Price (ETH)</Label>
              <Input
                id="icon-price"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.05"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Preview Image Section */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Preview Image</Label>
              <Tabs
                value={previewMode}
                onValueChange={setPreviewMode}
                className="w-auto"
              >
                <TabsList className="h-8">
                  <TabsTrigger value="url" className="gap-1.5 px-2 text-xs">
                    <Link className="h-3 w-3" />
                    URL
                  </TabsTrigger>
                  <TabsTrigger value="file" className="gap-1.5 px-2 text-xs">
                    <Upload className="h-3 w-3" />
                    Upload
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {previewMode === "url" ? (
              <Input
                placeholder="https://... or ipfs://..."
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
              />
            ) : (
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setPreviewFile(e.target.files?.[0] || null)}
                className="cursor-pointer file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-sm file:font-medium file:text-background"
              />
            )}
          </div>

          {/* Download Asset Section */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Download Asset</Label>
              <Tabs
                value={assetMode}
                onValueChange={setAssetMode}
                className="w-auto"
              >
                <TabsList className="h-8">
                  <TabsTrigger value="url" className="gap-1.5 px-2 text-xs">
                    <Link className="h-3 w-3" />
                    URL
                  </TabsTrigger>
                  <TabsTrigger value="file" className="gap-1.5 px-2 text-xs">
                    <Upload className="h-3 w-3" />
                    Upload
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {assetMode === "url" ? (
              <Input
                placeholder="https://... or ipfs://..."
                value={assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
              />
            ) : (
              <Input
                type="file"
                onChange={(e) => setAssetFile(e.target.files?.[0] || null)}
                className="cursor-pointer file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-sm file:font-medium file:text-background"
              />
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Adding..." : "Add Icon"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
