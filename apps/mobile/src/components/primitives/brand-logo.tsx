import NSLogo from "../../../assets/NSLogo.svg";

type BrandLogoProps = {
  width?: number;
  height?: number;
};

export function BrandLogo({ width = 112, height = 40 }: BrandLogoProps) {
  return <NSLogo width={width} height={height} />;
}
