import * as React from 'react';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center justify-center border font-medium [&_svg]:-ms-px [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--accent-primary)] text-white border-transparent',
        secondary: 'bg-[var(--surface-elevated)] text-[var(--text)] border-[var(--border)]',
        success: 'bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/20',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        info: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
        mono: 'bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)]',
        destructive: 'bg-red-500/10 text-red-400 border-red-500/20',
      },
      appearance: {
        solid: 'border-transparent',
        outline: '',
        stroke: 'bg-transparent border border-[var(--border)] text-[var(--text)]',
        ghost: 'border-transparent bg-transparent',
      },
      size: {
        lg: 'rounded-md px-2 h-7 min-w-7 gap-1.5 text-xs [&_svg]:size-3.5',
        md: 'rounded-md px-1.5 h-6 min-w-6 gap-1.5 text-xs [&_svg]:size-3.5',
        sm: 'rounded-sm px-1.5 h-5 min-w-5 gap-1 text-[11px] leading-3 [&_svg]:size-3',
        xs: 'rounded-sm px-1 h-4 min-w-4 gap-1 text-[10px] leading-[10px] [&_svg]:size-3',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      appearance: 'solid',
      size: 'sm',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({
  className,
  variant,
  size,
  appearance,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, appearance }), className)}
      {...props}
    />
  );
}

function BadgeDot({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="badge-dot"
      className={cn('size-1.5 rounded-full bg-current opacity-75', className)}
      {...props}
    />
  );
}

export { Badge, BadgeDot, badgeVariants };
