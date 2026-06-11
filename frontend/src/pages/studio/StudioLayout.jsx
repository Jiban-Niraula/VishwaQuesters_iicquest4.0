import StudioStyles from "./StudioStyles";
import StudioTopbar from "./StudioTopbar";
import StudioStage from "./StudioStage";
import StudioSidebar from "./StudioSidebar";

export default function StudioLayout({ studio }) {
  return (
    <>
      <StudioStyles />
      <div className="vc-studio-shell min-h-screen text-white flex flex-col">
        <StudioTopbar studio={studio} />
        <div className="vc-workspace flex flex-1 overflow-hidden">
          <StudioStage studio={studio} />
          <StudioSidebar studio={studio} />
        </div>
      </div>
    </>
  );
}
