import React, { useState, useRef } from 'react';
import { Button } from './button';
import { X, UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

export interface UploadedImage {
  file: File;
  preview: string;
  base64: string;
}

interface MultiImageUploadProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxImages?: number;
}

export function MultiImageUpload({ images, onChange, maxImages = 5 }: MultiImageUploadProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const selectedFiles = Array.from(e.target.files);
    
    if (images.length + selectedFiles.length > maxImages) {
      toast.error(`Solo puedes subir un máximo de ${maxImages} imágenes.`);
      return;
    }

    setIsCompressing(true);
    const newImages: UploadedImage[] = [];

    const options = {
      maxSizeMB: 1, // Max file size in MB
      maxWidthOrHeight: 1280, // Max width/height
      useWebWorker: true,
    };

    try {
      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) {
          toast.error(`El archivo ${file.name} no es una imagen.`);
          continue;
        }

        const compressedFile = await imageCompression(file, options);
        const base64 = await imageCompression.getDataUrlFromFile(compressedFile);
        
        newImages.push({
          file: compressedFile,
          preview: URL.createObjectURL(compressedFile),
          base64,
        });
      }
      
      onChange([...images, ...newImages]);
    } catch (error) {
      console.error('Error al comprimir imagen:', error);
      toast.error('Ocurrió un error al procesar las imágenes.');
    } finally {
      setIsCompressing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    URL.revokeObjectURL(newImages[index].preview);
    newImages.splice(index, 1);
    onChange(newImages);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {images.map((img, index) => (
          <div key={index} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted">
            <img src={img.preview} alt={`Preview ${index}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(index)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isCompressing}
            className="w-24 h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/25 rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-muted/20"
          >
            {isCompressing ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
            <span className="text-xs font-medium">{isCompressing ? 'Procesando...' : 'Agregar Foto'}</span>
          </button>
        )}
      </div>
      
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        className="hidden"
      />
      <p className="text-xs text-muted-foreground">
        Puedes subir hasta {maxImages} imágenes. Serán comprimidas automáticamente.
      </p>
    </div>
  );
}
