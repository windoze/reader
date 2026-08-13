import { Upload } from "lucide-react";
import { useRef, useState } from "react";

interface UploadDropzoneProps {
  disabled?: boolean;
  groupId?: string;
  onImport(files: File[], groupId?: string): Promise<void>;
}

const ACCEPTED_TYPES = ".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain";

export function UploadDropzone({ disabled, groupId, onImport }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const importFiles = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);

    if (files.length > 0) {
      void onImport(files, groupId);
    }
  };

  return (
    <div
      className={isDragging ? "upload-dropzone dragging" : "upload-dropzone"}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        importFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        accept={ACCEPTED_TYPES}
        disabled={disabled}
        multiple
        type="file"
        onChange={(event) => importFiles(event.currentTarget.files)}
      />
      <button
        className="primary-button"
        disabled={disabled}
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={18} aria-hidden />
        <span>{disabled ? "处理中" : "导入图书"}</span>
      </button>
    </div>
  );
}
