import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { paletaClara } from "@/lib/preferencias";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  /* O aviso segue o tema do sistema, e não o do computador: antes era o
     next-themes, que ninguém configurou, e ele respondia "system", o que dava
     aviso claro num sistema escuro para quem usa o computador no claro. */
  const { palette } = useTheme();

  return (
    <Sonner
      theme={paletaClara(palette) ? "light" : "dark"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
