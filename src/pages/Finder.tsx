import { useEffect } from "react";
import { appConfig } from "@/config/app-config";

export default function Finder() {
  useEffect(() => {
    document.title = `Finder — ${appConfig.name}`;
  }, []);

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6">
      <iframe
        src="/finder-app/index.html"
        title="AW Finder"
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
