import { FiImage } from "react-icons/fi";

export default function FileUpload({ onFileSelect }) {
  return (
    <>
      <label htmlFor="file-upload" className="cursor-pointer text-gray-400 hover:text-blue-400">
        <FiImage size={20} />
      </label>
      <input
        id="file-upload"
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0]);
          }
        }}
      />
    </>
  );
}
