import { useEffect } from "react";
import { appConfig } from "@/config/app-config";

export default function Writer() {
  useEffect(() => {
    document.title = `Writer — ${appConfig.name}`;
  }, []);

  return (
    <div className="h-full w-full flex flex-col -m-3 sm:-m-6">
      <iframe
        src="/writer/index.html"
        title="AW Writer"
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; downloads"
      />
    </div>
  );
}
