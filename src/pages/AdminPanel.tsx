import { useEffect, useState, useMemo } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import "./AdminPanel.css";

interface Capacitacion {
  id: string;
  nombre: string;
  correo: string;
  nit: string;
  fecha: string;
  hora: string;
  capacitacion: string;
  linkMeet: string;
  userEmail: string | null;
  creadoEn: { seconds: number } | null;
}

type EditableFields = Pick<Capacitacion, "nombre" | "correo" | "nit" | "fecha" | "hora" | "capacitacion" | "linkMeet">;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const AdminPanel = () => {
  const [registros, setRegistros] = useState<Capacitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mesSeleccionado, setMesSeleccionado] = useState<string>("todos");

  // Modal
  const [modalReg, setModalReg] = useState<Capacitacion | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditableFields>({
    nombre: "", correo: "", nit: "", fecha: "", hora: "", capacitacion: "", linkMeet: "",
  });

  const fetchRegistros = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "capacitaciones"), orderBy("creadoEn", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Capacitacion[];
      setRegistros(data);
    } catch (error) {
      console.error("Error al cargar registros:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistros();
  }, []);

  // Meses disponibles a partir de los registros
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    registros.forEach((r) => {
      if (r.fecha) {
        const [year, month] = r.fecha.split("-");
        if (year && month) set.add(`${year}-${month}`);
      }
    });
    return Array.from(set).sort().reverse();
  }, [registros]);

  const formatMesLabel = (ym: string) => {
    const [year, month] = ym.split("-");
    return `${MESES[parseInt(month, 10) - 1]} ${year}`;
  };

  // Filtrado
  const filtered = useMemo(() => {
    return registros.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        r.nombre.toLowerCase().includes(q) ||
        r.correo.toLowerCase().includes(q) ||
        r.nit.toLowerCase().includes(q) ||
        r.capacitacion.toLowerCase().includes(q) ||
        (r.userEmail ?? "").toLowerCase().includes(q);

      const matchMes =
        mesSeleccionado === "todos" || r.fecha.startsWith(mesSeleccionado);

      return matchSearch && matchMes;
    });
  }, [registros, search, mesSeleccionado]);

  const formatDate = (ts: { seconds: number } | null) => {
    if (!ts) return "—";
    return new Date(ts.seconds * 1000).toLocaleString("es-CO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFechaLarga = (fecha: string) => {
    if (!fecha) return "—";
    const [year, month, day] = fecha.split("-");
    return `${day} de ${MESES[parseInt(month, 10) - 1]} de ${year}`;
  };

  // Modal handlers
  const openModal = (reg: Capacitacion) => {
    setModalReg(reg);
    setIsEditing(false);
    setEditForm({
      nombre: reg.nombre,
      correo: reg.correo,
      nit: reg.nit,
      fecha: reg.fecha,
      hora: reg.hora,
      capacitacion: reg.capacitacion,
      linkMeet: reg.linkMeet ?? "",
    });
  };

  const closeModal = () => {
    setModalReg(null);
    setIsEditing(false);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async () => {
    if (!modalReg) return;
    try {
      await updateDoc(doc(db, "capacitaciones", modalReg.id), { ...editForm });
      setRegistros((prev) =>
        prev.map((r) => (r.id === modalReg.id ? { ...r, ...editForm } : r))
      );
      setModalReg({ ...modalReg, ...editForm });
      setIsEditing(false);
    } catch (error) {
      console.error("Error al actualizar:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este registro?")) return;
    try {
      await deleteDoc(doc(db, "capacitaciones", id));
      setRegistros((prev) => prev.filter((r) => r.id !== id));
      closeModal();
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <p className="admin-loading">Cargando registros...</p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div>
          <h1>Panel de Administración</h1>
          <p>{filtered.length} de {registros.length} registros</p>
        </div>
        <div className="admin-actions">
          <select
            className="admin-month-filter"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
          >
            <option value="todos">Todos los meses</option>
            {mesesDisponibles.map((ym) => (
              <option key={ym} value={ym}>{formatMesLabel(ym)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-search"
          />
          <button className="btn-refresh" onClick={fetchRegistros}>
            Actualizar
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-empty">
          {search || mesSeleccionado !== "todos"
            ? "No se encontraron resultados para este filtro."
            : "No hay registros aún."}
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Capacitación</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Correo cliente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((reg) => (
                <tr key={reg.id}>
                  <td>
                    <span className="cell-main">{reg.nombre}</span>
                    <span className="cell-sub">NIT: {reg.nit}</span>
                  </td>
                  <td><span className="cell-cap">{reg.capacitacion}</span></td>
                  <td>{formatFechaLarga(reg.fecha)}</td>
                  <td><span className="cell-hora">{reg.hora}</span></td>
                  <td>{reg.correo}</td>
                  <td>
                    <div className="td-actions">
                      <button className="btn-edit" onClick={() => openModal(reg)}>Editar</button>
                      <button className="btn-delete" onClick={() => handleDelete(reg.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modal ─── */}
      {modalReg && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {isEditing ? "Editar Registro" : "Detalle del Registro"}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-grid">
                <div className="modal-field">
                  <label>Empresa</label>
                  {isEditing ? (
                    <input name="nombre" value={editForm.nombre} onChange={handleEditChange} />
                  ) : (
                    <span>{modalReg.nombre}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>NIT de empresa</label>
                  {isEditing ? (
                    <input name="nit" value={editForm.nit} onChange={handleEditChange} />
                  ) : (
                    <span>{modalReg.nit}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Correo cliente</label>
                  {isEditing ? (
                    <textarea
                      rows={1}
                      value={editForm.correo}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, correo: e.target.value }))}
                      autoComplete="off"
                      className="modal-textarea-single"
                    />
                  ) : (
                    <span>{modalReg.correo}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Capacitación</label>
                  {isEditing ? (
                    <input name="capacitacion" value={editForm.capacitacion} onChange={handleEditChange} />
                  ) : (
                    <span>{modalReg.capacitacion}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Fecha</label>
                  {isEditing ? (
                    <input name="fecha" type="date" value={editForm.fecha} onChange={handleEditChange} />
                  ) : (
                    <span>{formatFechaLarga(modalReg.fecha)}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Hora</label>
                  {isEditing ? (
                    <input name="hora" type="time" value={editForm.hora} onChange={handleEditChange} />
                  ) : (
                    <span>{modalReg.hora}</span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Link de Meet</label>
                  {isEditing ? (
                    <input name="linkMeet" type="url" value={editForm.linkMeet} onChange={handleEditChange} />
                  ) : (
                    <span>
                      {modalReg.linkMeet ? (
                        <a href={modalReg.linkMeet} target="_blank" rel="noopener noreferrer">{modalReg.linkMeet}</a>
                      ) : "—"}
                    </span>
                  )}
                </div>
                <div className="modal-field">
                  <label>Jurídico</label>
                  <span>{modalReg.userEmail ?? "—"}</span>
                </div>
              </div>
              <div className="modal-meta">
                Registrado: {formatDate(modalReg.creadoEn)}
              </div>
            </div>

            <div className="modal-actions">
              {isEditing ? (
                <>
                  <button className="btn-save" onClick={handleSaveEdit}>Guardar cambios</button>
                  <button className="btn-cancel" onClick={() => setIsEditing(false)}>Cancelar</button>
                </>
              ) : (
                <>
                  <button className="btn-edit" onClick={() => setIsEditing(true)}>Editar</button>
                  <button className="btn-delete" onClick={() => handleDelete(modalReg.id)}>Eliminar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
