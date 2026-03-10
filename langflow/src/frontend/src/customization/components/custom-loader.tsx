import { useEffect, useState } from "react";
import LogoDark from "@/assets/logo_dark.png";

type CustomLoaderProps = {
  remSize?: number;
};

const CustomLoader = ({ remSize = 30 }: CustomLoaderProps) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-1000 ${show ? 'opacity-100' : 'opacity-0'}`}>
      <div className="relative mb-8 flex items-center justify-center">
        {/* Pulsing Glow Background */}
        <div className="absolute h-32 w-32 animate-pulse rounded-full bg-primary/20 blur-3xl"></div>

        {/* Logo Container */}
        <div className="relative animate-in fade-in zoom-in duration-700">
          <img
            src={LogoDark}
            alt="AICCORE Logo"
            className="h-20 w-auto object-contain"
          />
        </div>
      </div>

      {/* Modern Wave Loader */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: `${i * 0.15}s` }}
          ></div>
        ))}
      </div>

      <p className="mt-4 animate-pulse text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Initializing AICCORE
      </p>
    </div>
  );
};

export default CustomLoader;
