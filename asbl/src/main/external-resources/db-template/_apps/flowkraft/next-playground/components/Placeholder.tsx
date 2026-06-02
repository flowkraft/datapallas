import { ComponentType } from "react";

interface PlaceholderProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export function Placeholder({ title, description, icon: Icon }: PlaceholderProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-base-200 border-2 border-dashed border-base-300 rounded-lg p-12 text-center">
        <Icon className="w-16 h-16 text-primary mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-base-content mb-2">
          {title}
        </h1>
        <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
          {description}
        </p>
        <div className="mt-8 text-sm text-base-content/40">
          This component is currently under development
        </div>
      </div>
    </div>
  );
}
