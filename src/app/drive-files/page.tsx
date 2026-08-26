import { DriveFilesPanel } from "@/components/DriveFilesPanel";

export default function DriveFilesPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Drive Files</h1>
        <p className="mt-1 text-sm text-white/50">Browse and manage files in your connected Google Drive.</p>
      </div>
      <DriveFilesPanel />
    </div>
  );
}