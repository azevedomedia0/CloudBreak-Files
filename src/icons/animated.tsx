import React, { forwardRef, type CSSProperties } from 'react';
import * as Animated from 'lucide-animated';

type CompatIconProps = React.HTMLAttributes<HTMLElement> & {
  className?: string;
  size?: number | string;
  animateOnHover?: boolean;
  absoluteStrokeWidth?: boolean;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
  color?: string;
};

type AnimatedHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

/** Map common Tailwind width utilities to pixel sizes for lucide-animated's `size` prop. */
function sizeFromClassName(className?: string): number | undefined {
  if (!className) return undefined;
  const bracket = className.match(/(?:^|\s)w-\[(\d+(?:\.\d+)?)px\]/);
  if (bracket) return Math.round(Number(bracket[1]));
  const tokens = className.split(/\s+/);
  const map: Record<string, number> = {
    'w-2': 8,
    'w-2.5': 10,
    'w-3': 12,
    'w-3.5': 14,
    'w-4': 16,
    'w-5': 20,
    'w-6': 24,
    'w-7': 28,
    'w-8': 32,
    'w-10': 40,
    'w-12': 48,
    'w-16': 64,
  };
  for (const token of tokens) {
    if (map[token] != null) return map[token];
  }
  return undefined;
}

// lucide-animated icons are ForwardRef components with a slightly different prop surface than lucide-react.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adapt(Icon: React.ComponentType<any>) {
  const Comp = forwardRef<AnimatedHandle, CompatIconProps>(function AdaptedIcon(
    { className, size, style, animateOnHover = true, ...rest },
    ref,
  ) {
    const resolved =
      typeof size === 'number'
        ? size
        : typeof size === 'string' && /^\d+$/.test(size)
          ? Number(size)
          : sizeFromClassName(className) ?? 16;

    return (
      <Icon
        ref={ref}
        className={className}
        size={resolved}
        style={style}
        animateOnHover={animateOnHover}
        {...rest}
      />
    );
  });
  Comp.displayName = (Icon as { displayName?: string }).displayName || 'AnimatedIcon';
  return Comp;
}

/** Lucide-animated icons used in the app (hover-animated). Names match lucide-react. */
export const AlignCenter = adapt(Animated.AlignCenterIcon);
export const AlignLeft = adapt(Animated.AlignLeftIcon);
export const AlignRight = adapt(Animated.AlignRightIcon);
export const Archive = adapt(Animated.ArchiveIcon);
export const ArrowDownAZ = adapt(Animated.ArrowDownAZIcon);
export const ArrowDownLeft = adapt(Animated.ArrowDownLeftIcon);
export const ArrowRight = adapt(Animated.ArrowRightIcon);
export const ArrowUpRight = adapt(Animated.ArrowUpRightIcon);
export const Battery = adapt(Animated.BatteryIcon);
export const Bell = adapt(Animated.BellIcon);
export const Bold = adapt(Animated.BoldIcon);
export const Cast = adapt(Animated.CastIcon);
export const Check = adapt(Animated.CheckIcon);
export const CheckCheck = adapt(Animated.CheckCheckIcon);
export const ChevronDown = adapt(Animated.ChevronDownIcon);
export const ChevronLeft = adapt(Animated.ChevronLeftIcon);
export const ChevronRight = adapt(Animated.ChevronRightIcon);
export const ChevronUp = adapt(Animated.ChevronUpIcon);
export const Clock = adapt(Animated.ClockIcon);
export const Copy = adapt(Animated.CopyIcon);
export const Cpu = adapt(Animated.CpuIcon);
export const Database = adapt(Animated.DatabaseIcon);
export const Download = adapt(Animated.DownloadIcon);
export const Eye = adapt(Animated.EyeIcon);
export const EyeOff = adapt(Animated.EyeOffIcon);
export const FileText = adapt(Animated.FileTextIcon);
export const Fingerprint = adapt(Animated.FingerprintIcon);
export const FolderDown = adapt(Animated.FolderDownIcon);
export const FolderInput = adapt(Animated.FolderInputIcon);
export const FolderLock = adapt(Animated.FolderLockIcon);
export const FolderOpen = adapt(Animated.FolderOpenIcon);
export const FolderPlus = adapt(Animated.FolderPlusIcon);
export const FolderUp = adapt(Animated.FolderUpIcon);
export const Italic = adapt(Animated.ItalicIcon);
export const Key = adapt(Animated.KeyIcon);
export const Layers = adapt(Animated.LayersIcon);
export const LayoutGrid = adapt(Animated.LayoutGridIcon);
export const Link = adapt(Animated.LinkIcon);
export const List = adapt(Animated.ListIcon);
export const Lock = adapt(Animated.LockIcon);
export const MapPin = adapt(Animated.MapPinIcon);
export const Maximize = adapt(Animated.MaximizeIcon);
export const Maximize2 = adapt(Animated.Maximize2Icon);
export const Minimize = adapt(Animated.MinimizeIcon);
export const Moon = adapt(Animated.MoonIcon);
export const Pause = adapt(Animated.PauseIcon);
export const Play = adapt(Animated.PlayIcon);
export const Plus = adapt(Animated.PlusIcon);
export const Radio = adapt(Animated.RadioIcon);
export const RefreshCw = adapt(Animated.RefreshCwIcon);
export const RotateCcw = adapt(Animated.RotateCcwIcon);
export const RotateCw = adapt(Animated.RotateCwIcon);
export const Search = adapt(Animated.SearchIcon);
export const Settings = adapt(Animated.SettingsIcon);
export const ShieldCheck = adapt(Animated.ShieldCheckIcon);
export const Sparkles = adapt(Animated.SparklesIcon);
export const Sun = adapt(Animated.SunIcon);
export const Terminal = adapt(Animated.TerminalIcon);
export const Underline = adapt(Animated.UnderlineIcon);
export const Upload = adapt(Animated.UploadIcon);
export const User = adapt(Animated.UserIcon);
export const Users = adapt(Animated.UsersIcon);
export const Wifi = adapt(Animated.WifiIcon);
export const X = adapt(Animated.XIcon);
