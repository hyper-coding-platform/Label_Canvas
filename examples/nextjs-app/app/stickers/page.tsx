import { StickerDesigner } from "./sticker-designer";

// Server component: renders the host page; the editor itself is a client component.
export default function StickersPage() {
  return (
    <>
      <h1>Stickers</h1>
      <StickerDesigner templateId="textile-hang-tag" />
    </>
  );
}
