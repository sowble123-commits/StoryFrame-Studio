import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackText?: string;
}

export function SafeImage({ src, alt, className, fallbackText = "No Image", ...props }: SafeImageProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    return (
      <div className={cn("flex flex-col items-center justify-center bg-surface-1 text-tertiary overflow-hidden", className)}>
        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
        <span className="text-[10px] font-medium opacity-80">{fallbackText}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      {...props}
    />
  );
}

// gate complete P0-03
