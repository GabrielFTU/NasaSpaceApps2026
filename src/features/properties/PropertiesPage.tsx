import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPinned, MoreHorizontal, Pencil, Plus, Sprout, Trash2, Home } from "lucide-react";
import { useAppStore } from "@/app/store";
import { PageHeader, EmptyState } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { PropertyMap } from "@/components/maps";
import { SOIL_TEXTURE_LABEL } from "@/data/crops";
import { fmt } from "@/lib/format";
import type { Property } from "@/types";

export function PropertiesPage() {
  const properties = useAppStore((s) => s.properties);
  const analyses = useAppStore((s) => s.analyses);
  const deleteProperty = useAppStore((s) => s.deleteProperty);
  const selectProperty = useAppStore((s) => s.selectProperty);
  const selectedId = useAppStore((s) => s.selectedPropertyId);
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Property | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const totalArea = properties.reduce((a, p) => a + p.areaHa, 0);

  return (
    <>
      <PageHeader
        title="Propriedades"
        description={properties.length ? `${properties.length} propriedade(s) · ${fmt.n1(totalArea)} ha no total` : undefined}
        actions={
          <Link to="/propriedades/nova" className={buttonVariants()}>
            <Plus /> Nova propriedade
          </Link>
        }
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={<MapPinned />}
          title="Nenhuma propriedade cadastrada"
          description="Desenhe o contorno no mapa — a área é calculada sozinha."
          action={
            <Link to="/propriedades/nova" className={buttonVariants()}>
              <Plus /> Cadastrar propriedade
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => {
            const n = analyses.filter((a) => a.propertyId === p.id).length;
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="relative h-40">
                  <PropertyMap lat={p.latitude} lon={p.longitude} boundary={p.boundary} interactive={false} className="h-full rounded-none" />
                  {p.id === selectedId && (
                    <Badge className="absolute left-3 top-3 z-[500] bg-white text-primary shadow-sm">
                      <Home /> No início
                    </Badge>
                  )}
                  <div className="absolute right-3 top-3 z-[500]">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="glass border-0"
                      aria-label={`Ações para ${p.name}`}
                      aria-expanded={menu === p.id}
                      onClick={() => setMenu(menu === p.id ? null : p.id)}
                    >
                      <MoreHorizontal />
                    </Button>
                    {menu === p.id && (
                      <div className="glass animate-in absolute right-0 top-9 w-44 rounded-md border p-1" onMouseLeave={() => setMenu(null)}>
                        <MenuItem icon={<Pencil />} onClick={() => navigate(`/propriedades/${p.id}/editar`)}>
                          Editar
                        </MenuItem>
                        <MenuItem
                          icon={<Home />}
                          onClick={() => {
                            selectProperty(p.id);
                            setMenu(null);
                            toast.success("Propriedade selecionada", p.name);
                          }}
                        >
                          Mostrar no início
                        </MenuItem>
                        <MenuItem
                          icon={<Trash2 />}
                          danger
                          onClick={() => {
                            setMenu(null);
                            setToDelete(p);
                          }}
                        >
                          Excluir
                        </MenuItem>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="truncate font-semibold">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {p.city}, {p.state}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary-soft-foreground">{fmt.n1(p.areaHa)} ha</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Solo {SOIL_TEXTURE_LABEL[p.soil.texture].toLowerCase()}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                      {n} {n === 1 ? "análise" : "análises"}
                    </span>
                  </div>
                  <Link to={`/analise?propriedade=${p.id}`} className={buttonVariants({ variant: "subtle", className: "mt-4 w-full" })}>
                    <Sprout /> Nova análise
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Excluir propriedade?"
        description={
          <>
            <strong className="text-foreground">{toDelete?.name}</strong> será removida. As análises já salvas continuam disponíveis.
          </>
        }
        onConfirm={() => {
          if (!toDelete) return;
          deleteProperty(toDelete.id);
          toast.success("Propriedade excluída", toDelete.name);
        }}
      />
    </>
  );
}

function MenuItem({ icon, onClick, danger, children }: { icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted [&_svg]:size-4 ${danger ? "text-danger" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}
