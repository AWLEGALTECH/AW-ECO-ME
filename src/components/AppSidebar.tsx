import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { appConfig } from "@/config/app-config";
import { LayoutDashboard, Users, Briefcase, Scale, Zap, PenSquare } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem { title: string; url: string; icon: any }

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes",  url: "/clientes",  icon: Users },
  { title: "Processos", url: "/processos", icon: Briefcase },
  { title: "Writer",    url: "/writer",    icon: PenSquare },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon" className="border-none bg-transparent h-full">
      <button
        onClick={() => navigate("/dashboard")}
        className={`flex items-center h-14 shrink-0 border-b border-white/[0.06] transition-colors hover:bg-white/[0.02] ${collapsed ? "justify-center px-2" : "px-4 gap-3"}`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30 shrink-0">
          <Scale className="h-4 w-4 text-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col justify-center text-left">
            <span className="font-medium text-sm tracking-tight text-foreground leading-none">{appConfig.name}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] leading-none mt-1">{appConfig.tagline}</span>
          </div>
        )}
      </button>

      <SidebarContent className="py-1 overflow-y-auto scrollbar-thin">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.18em] font-medium text-muted-foreground px-3 pt-3 pb-1 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary opacity-80" />
              AW System
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      className={
                        isActive
                          ? "bg-primary/15 text-primary rounded-xl mx-1"
                          : "text-sidebar-foreground hover:bg-white/[0.06] hover:text-foreground rounded-xl mx-1 transition-colors"
                      }
                    >
                      <NavLink to={item.url} end className="" activeClassName="">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/[0.05] p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-primary/60 shrink-0" />
            <p className="text-[9px] text-muted-foreground tracking-widest uppercase">
              {appConfig.name} v0.1
            </p>
          </div>
        ) : (
          <Zap className="h-3 w-3 text-primary/50 mx-auto" />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
