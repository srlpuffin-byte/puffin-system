import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, Lock, Unlock, KeyRound, Pencil } from "lucide-react";

interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  usuario: string;
  rol: string;
  activo: boolean;
  bloqueado: boolean;
  intentos_fallidos: number;
}

function NuevoUsuarioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ nombre: "", apellido: "", usuario: "", pin: "", rol: "empleado" });

  const mutation = useMutation({
    mutationFn: () => apiFetch("/usuarios", {
      method: "POST",
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Usuario creado correctamente" });
      setForm({ nombre: "", apellido: "", usuario: "", pin: "", rol: "empleado" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo Usuario</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Nombre de usuario</Label>
            <Input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="ej: jgomez" />
          </div>
          <div>
            <Label>PIN (4-10 dígitos)</Label>
            <Input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="0000" maxLength={10} />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrador">Administrador</SelectItem>
                <SelectItem value="empleado">Empleado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Creando..." : "Crear Usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarUsuarioDialog({ user, onClose }: { user: Usuario; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ nombre: user.nombre, apellido: user.apellido, rol: user.rol, activo: user.activo });

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/usuarios/${user.id}`, {
      method: "PUT",
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Usuario actualizado" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Usuario</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrador">Administrador</SelectItem>
                <SelectItem value="empleado">Empleado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={form.activo ? "activo" : "inactivo"} onValueChange={(v) => setForm({ ...form, activo: v === "activo" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPinDialog({ user, onClose }: { user: Usuario; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pin, setPin] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/usuarios/${user.id}/reset-pin`, {
      method: "POST",
      body: JSON.stringify({ nuevo_pin: pin }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "PIN restablecido correctamente" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Restablecer PIN — {user.nombre} {user.apellido}</DialogTitle></DialogHeader>
        <div>
          <Label>Nuevo PIN (4-10 dígitos)</Label>
          <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Ingrese nuevo PIN" maxLength={10} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || pin.length < 4}>
            {mutation.isPending ? "Restableciendo..." : "Restablecer PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Usuarios() {
  const [showNuevo, setShowNuevo] = useState(false);
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [resetPinUser, setResetPinUser] = useState<Usuario | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
    queryKey: ["usuarios"],
    queryFn: () => apiFetch("/usuarios"),
  });

  const toggleBloqueo = useMutation({
    mutationFn: ({ id, bloqueado }: { id: number; bloqueado: boolean }) =>
      apiFetch(`/usuarios/${id}`, { method: "PUT", body: JSON.stringify({ bloqueado }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-primary">Gestión de Usuarios</h1>
        </div>
        <Button onClick={() => setShowNuevo(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo Usuario
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{usuarios.length}</div>
            <p className="text-sm text-muted-foreground">Total usuarios</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600">{usuarios.filter(u => u.activo && !u.bloqueado).length}</div>
            <p className="text-sm text-muted-foreground">Usuarios activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-600">{usuarios.filter(u => u.bloqueado).length}</div>
            <p className="text-sm text-muted-foreground">Bloqueados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Usuarios del Sistema</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando usuarios...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Intentos fallidos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nombre} {u.apellido}</TableCell>
                    <TableCell className="text-muted-foreground font-mono">{u.usuario}</TableCell>
                    <TableCell>
                      <Badge variant={u.rol === "administrador" ? "default" : "secondary"}>
                        {u.rol === "administrador" ? "Administrador" : "Empleado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.bloqueado ? (
                        <Badge variant="destructive">Bloqueado</Badge>
                      ) : u.activo ? (
                        <Badge className="bg-green-600">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={u.intentos_fallidos > 0 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                        {u.intentos_fallidos}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditUser(u)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetPinUser(u)} title="Restablecer PIN">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleBloqueo.mutate({ id: u.id, bloqueado: !u.bloqueado })}
                          title={u.bloqueado ? "Desbloquear" : "Bloquear"}
                        >
                          {u.bloqueado ? <Unlock className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-red-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay usuarios registrados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NuevoUsuarioDialog open={showNuevo} onClose={() => setShowNuevo(false)} />
      {editUser && <EditarUsuarioDialog user={editUser} onClose={() => setEditUser(null)} />}
      {resetPinUser && <ResetPinDialog user={resetPinUser} onClose={() => setResetPinUser(null)} />}
    </div>
  );
}
