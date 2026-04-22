"use client";

import { useState, useCallback } from "react";

interface UseImageConverterOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  onError?: (error: string) => void;
}

interface UseImageConverterReturn {
  convert: (file: File) => Promise<File>;
  isConverting: boolean;
  originalSize: number | null;
  convertedSize: number | null;
  compressionRatio: number | null;
}

function supportsWebP(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

export function useImageConverter(
  options: UseImageConverterOptions = {},
): UseImageConverterReturn {
  const { quality = 0.85, maxWidth = 1200, maxHeight = 1200, onError } = options;

  const [isConverting, setIsConverting] = useState(false);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [convertedSize, setConvertedSize] = useState<number | null>(null);
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);

  const convert = useCallback(
    async (file: File): Promise<File> => {
      if (file.type === "image/webp") {
        setOriginalSize(file.size);
        setConvertedSize(file.size);
        setCompressionRatio(0);
        return file;
      }

      if (!file.type.startsWith("image/")) {
        throw new Error("El archivo no es una imagen");
      }

      setIsConverting(true);
      setOriginalSize(file.size);

      try {
        const outputFormat = supportsWebP() ? "image/webp" : "image/jpeg";
        const outputExtension = outputFormat === "image/webp" ? "webp" : "jpg";

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Error al leer el archivo"));
          reader.readAsDataURL(file);
        });

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Error al cargar la imagen"));
          image.src = dataUrl;
        });

        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo crear el contexto canvas");

        if (outputFormat === "image/jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error("Error al convertir la imagen"));
            },
            outputFormat,
            quality,
          );
        });

        const originalName = file.name.replace(/\.[^.]+$/, "");
        const convertedFile = new File(
          [blob],
          `${originalName}.${outputExtension}`,
          { type: outputFormat },
        );

        const ratio = Math.round(
          ((file.size - convertedFile.size) / file.size) * 100,
        );
        setConvertedSize(convertedFile.size);
        setCompressionRatio(ratio);

        return convertedFile;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error al convertir la imagen";
        onError?.(message);
        setConvertedSize(file.size);
        setCompressionRatio(0);
        return file;
      } finally {
        setIsConverting(false);
      }
    },
    [quality, maxWidth, maxHeight, onError],
  );

  return { convert, isConverting, originalSize, convertedSize, compressionRatio };
}
