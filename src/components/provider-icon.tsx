import Image from 'next/image';
import { ServerCog } from 'lucide-react';

type ProviderIconDescriptor = { path: string; source?: string } | null;

export function ProviderIcon({
  icon,
  name,
  size = 22
}: {
  icon: ProviderIconDescriptor;
  name: string;
  size?: number;
}) {
  return <span className="provider-icon" style={{ width: size, height: size }} title={name} aria-hidden="true">
    {icon
      ? <Image src={icon.path} alt="" width={size} height={size} unoptimized />
      : <ServerCog width={size} height={size} />}
  </span>;
}
