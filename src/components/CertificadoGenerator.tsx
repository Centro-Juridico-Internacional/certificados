import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { db } from "../firebase";
import diplomaImg from "../assets/diploma.jpg";
import "./CertificadoGenerator.css";

interface Asistente {
  nombre: string;
  cedula: string;
}

interface DatosCapacitacion {
  empresa: string;
  nit: string;
  capacitacion: string;
  fecha: string;
}

interface RegistroCapacitacion {
  id: string;
  empresa: string;
  nit: string;
  capacitacion: string;
  fecha: string;
  hora: string;
  correo: string;
  juridico: string;
  creadoEn: Timestamp | null;
}

const CAPACITACIONES = [
  "ELABORACIÓN REGLAMENTO INTERNO DE TRABAJO",
  "ACTUALIZACIÓN REGLAMENTO INTERNO DE TRABAJO",
  "POLÍTICA DE PROTECCIÓN DE DATOS ELABORACIÓN",
  "ELABORACIÓN POLÍTICA DE DESCONEXIÓN LABORAL",
  "MANUAL OBLIGATORIO EMPRESARIAL DE TÉRMINOS Y CONDICIONES",
  "POLÍTICA DE REGLAMENTACIÓN DE MODALIDADES LABORALES NO PRESENCIALES",
  "POLÍTICA DE PREVENCIÓN Y ATENCIÓN DE LA DISCRIMINACIÓN Y ACOSO EN EL AMBIENTE LABORAL",
  "POLÍTICA DE PERMISOS LICENCIAS E INCAPACIDADES",
  "POLÍTICA DE PREVENCIÓN DEL ACOSO SEXUAL EN EL AMBIENTE LABORAL",
  "POLÍTICA DE COMISIONES Y BONIFICACIONES",
  "POLÍTICA DE MEDIOS TECNOLÓGICOS",
];

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const formatFechaCert = (fecha: string) => {
  if (!fecha) return "";
  const parts = fecha.split("-");
  if (parts.length !== 3) return fecha;
  const [year, month, day] = parts;
  const mesIdx = parseInt(month, 10) - 1;
  if (mesIdx < 0 || mesIdx > 11) return fecha;
  return `A los ${parseInt(day, 10).toString().padStart(2, "0")} dias del mes de ${MESES[mesIdx]} de ${year}`;
};

// Genera el PDF usando jsPDF directamente (sin html2canvas ni DOM oculto)
const generarPDF = async (
  asistentes: Asistente[],
  datos: DatosCapacitacion,
  onProgress: (p: number) => void,
) => {
  // Cargar imagen del diploma como base64
  const imgResponse = await fetch(diplomaImg);
  const imgBlob = await imgResponse.blob();
  const imgBase64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(imgBlob);
  });

  const pdf = new jsPDF("landscape", "mm", "a4");
  const pdfW = pdf.internal.pageSize.getWidth(); // 297
  const pdfH = pdf.internal.pageSize.getHeight(); // 210

  for (let i = 0; i < asistentes.length; i++) {
    if (i > 0) pdf.addPage();
    onProgress(Math.round(((i + 1) / asistentes.length) * 100));

    // Fondo del diploma
    pdf.addImage(imgBase64, "JPEG", 0, 0, pdfW, pdfH);

    const cx = pdfW / 2 + 42;

    // Nombre del asistente
    pdf.setFont("times", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(30, 41, 59);
    pdf.text(asistentes[i].nombre, cx, 123, { align: "center" });

    // Cédula
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`CC: ${asistentes[i].cedula}`, cx, 129, { align: "center" });

    // Por su asistencia a la socialización de...
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(`Por su asistencia a la socializacion de ${datos.capacitacion.toLowerCase()}`, cx, 138, { align: "center", maxWidth: 180 });

    // De la empresa
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(`De la empresa ${datos.empresa.toUpperCase()}`, cx, 146, { align: "center" });

    // Testimonio
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    pdf.text(
      "En testimonio de lo expuesto, se expide el siguiente certificado en Bogota D.C.",
      cx, 156, { align: "center" }
    );
    pdf.text(formatFechaCert(datos.fecha), cx, 162, { align: "center" });
  }

  pdf.save(`Certificados_${datos.empresa.replace(/\s+/g, "_")}.pdf`);
};

const CertificadoGenerator = () => {
  const [nit, setNit] = useState("");
  const [capacitacionSel, setCapacitacionSel] = useState("");
  const [datos, setDatos] = useState<DatosCapacitacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [asistentes, setAsistentes] = useState<Asistente[]>([]);
  const [generating, setGenerating] = useState(false);
  const [registros, setRegistros] = useState<RegistroCapacitacion[]>([]);
  const [filtro, setFiltro] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editRegistro, setEditRegistro] = useState<RegistroCapacitacion | null>(null);
  const [editForm, setEditForm] = useState({
    empresa: "", nit: "", correo: "", capacitacion: "", fecha: "", hora: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "capacitaciones"), orderBy("creadoEn", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: RegistroCapacitacion[] = snap.docs.map((d) => {
        const data = d.data();
        const userEmail = String(data.userEmail ?? "");
        const juridico = userEmail.split("@")[0] || "—";
        return {
          id: d.id,
          empresa: String(data.nombre ?? ""),
          nit: String(data.nit ?? ""),
          capacitacion: String(data.capacitacion ?? ""),
          fecha: String(data.fecha ?? ""),
          hora: String(data.hora ?? ""),
          correo: String(data.correo ?? ""),
          juridico,
          creadoEn: (data.creadoEn as Timestamp | undefined) ?? null,
        };
      });
      setRegistros(rows);
    });
    return () => unsub();
  }, []);

  const registrosFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return registros;
    return registros.filter((r) =>
      r.empresa.toLowerCase().includes(q) ||
      r.nit.toLowerCase().includes(q) ||
      r.correo.toLowerCase().includes(q) ||
      r.capacitacion.toLowerCase().includes(q) ||
      r.juridico.toLowerCase().includes(q) ||
      r.fecha.toLowerCase().includes(q) ||
      r.hora.toLowerCase().includes(q)
    );
  }, [registros, filtro]);

  const ejecutarBusqueda = (nitBuscar: string, capacitacionBuscar: string) => {
    if (!nitBuscar.trim() || !capacitacionBuscar) {
      setErrorBusqueda("Ingrese el NIT y seleccione la capacitacion.");
      return;
    }

    setBuscando(true);
    setErrorBusqueda(null);
    setDatos(null);
    setAsistentes([]);

    try {
      const porNit = registros.filter((r) => r.nit.trim() === nitBuscar.trim());

      if (porNit.length === 0) {
        setErrorBusqueda("No se encontro ninguna empresa con ese NIT.");
        return;
      }

      const encontrado = porNit.find((r) => r.capacitacion === capacitacionBuscar);

      if (!encontrado) {
        const caps = porNit.map((r) => r.capacitacion).join(", ");
        setErrorBusqueda(`Empresa encontrada pero no tiene esa capacitacion. Disponibles: ${caps}`);
        return;
      }

      setDatos({
        empresa: encontrado.empresa,
        nit: nitBuscar.trim(),
        capacitacion: encontrado.capacitacion,
        fecha: encontrado.fecha,
      });
    } finally {
      setBuscando(false);
    }
  };

  const buscarCapacitacion = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    ejecutarBusqueda(nit, capacitacionSel);
  };

  const regenerarDesdeRegistro = (r: RegistroCapacitacion) => {
    setNit(r.nit);
    setCapacitacionSel(r.capacitacion);
    setErrorBusqueda(null);
    setAsistentes([]);
    setDatos({
      empresa: r.empresa,
      nit: r.nit,
      capacitacion: r.capacitacion,
      fecha: r.fecha,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDatos(null);
    setAsistentes([]);
    setNit("");
    setCapacitacionSel("");
    setErrorBusqueda(null);
  };

  const openEdit = (r: RegistroCapacitacion) => {
    setEditRegistro(r);
    setEditForm({
      empresa: r.empresa,
      nit: r.nit,
      correo: r.correo,
      capacitacion: r.capacitacion,
      fecha: r.fecha,
      hora: r.hora,
    });
  };

  const closeEdit = () => {
    setEditRegistro(null);
  };

  const saveEdit = async () => {
    if (!editRegistro) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "capacitaciones", editRegistro.id), {
        nombre: editForm.empresa,
        nit: editForm.nit,
        correo: editForm.correo,
        capacitacion: editForm.capacitacion,
        fecha: editForm.fecha,
        hora: editForm.hora,
      });
      closeEdit();
    } catch (err) {
      console.error("Error al actualizar:", err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const parsed: Asistente[] = json.map((row) => {
          const keys = Object.keys(row);
          return {
            nombre: String(row[keys[0]] ?? "").trim(),
            cedula: String(row[keys[1]] ?? "").trim(),
          };
        }).filter((a) => a.nombre.length > 0);
        setAsistentes(parsed);
      } catch (err) {
        console.error("Error al leer Excel:", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerate = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!datos || asistentes.length === 0) return;
    setGenerating(true);
    try {
      await generarPDF(asistentes, datos, () => {});
    } catch (err) {
      console.error("Error al generar PDF:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="cert-card">
      <div className="cert-card-header">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        <div>
          <h2>Generar Certificados</h2>
          <p>Busque la capacitacion por NIT y suba el listado de asistentes.</p>
        </div>
      </div>

      <div className="cert-body">
        <div className="cert-registros">
          <div className="cert-registros-header">
            <h3>Solicitudes de capacitacion registradas</h3>
            <span className="cert-registros-count">
              {filtro ? `${registrosFiltrados.length} / ${registros.length}` : registros.length}
            </span>
          </div>
          {registros.length > 0 && (
            <div className="cert-registros-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Buscar por empresa, NIT, correo, capacitacion, juridico o fecha..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
              {filtro && (
                <button
                  type="button"
                  className="cert-registros-search-clear"
                  onClick={() => setFiltro("")}
                  aria-label="Limpiar busqueda"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          )}
          {registros.length === 0 ? (
            <p className="cert-registros-empty">Aun no hay solicitudes registradas.</p>
          ) : registrosFiltrados.length === 0 ? (
            <p className="cert-registros-empty">No se encontraron solicitudes que coincidan con "{filtro}".</p>
          ) : (
            <div className="cert-registros-table-wrap" translate="no">
              <table className="cert-registros-table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>N.I.T.</th>
                    <th>Correo</th>
                    <th>Capacitacion</th>
                    <th>Juridico</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.map((r) => (
                    <tr key={r.id}>
                      <td title={r.empresa}>{r.empresa}</td>
                      <td>{r.nit}</td>
                      <td title={r.correo}>{r.correo}</td>
                      <td title={r.capacitacion}>{r.capacitacion}</td>
                      <td title={r.juridico}>{r.juridico}</td>
                      <td>{r.fecha}</td>
                      <td>{r.hora}</td>
                      <td>
                        <div className="cert-registros-actions">
                          <button
                            type="button"
                            className="cert-registros-btn"
                            onClick={() => regenerarDesdeRegistro(r)}
                            disabled={buscando || generating}
                          >
                            Generar Certificados
                          </button>
                          <button
                            type="button"
                            className="cert-registros-btn cert-registros-btn-edit"
                            onClick={() => openEdit(r)}
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editRegistro && (
        <div className="cert-modal-overlay" onClick={closeEdit}>
          <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cert-modal-header">
              <h3>Editar solicitud</h3>
              <button type="button" className="cert-modal-close" onClick={closeEdit} aria-label="Cerrar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="cert-modal-body">
              <div className="cert-edit-field">
                <label>Empresa</label>
                <input
                  type="text"
                  value={editForm.empresa}
                  onChange={(e) => setEditForm({ ...editForm, empresa: e.target.value })}
                />
              </div>
              <div className="cert-edit-row">
                <div className="cert-edit-field">
                  <label>N.I.T.</label>
                  <input
                    type="text"
                    value={editForm.nit}
                    onChange={(e) => setEditForm({ ...editForm, nit: e.target.value })}
                  />
                </div>
                <div className="cert-edit-field">
                  <label>Correo</label>
                  <input
                    type="email"
                    value={editForm.correo}
                    onChange={(e) => setEditForm({ ...editForm, correo: e.target.value })}
                  />
                </div>
              </div>
              <div className="cert-edit-field">
                <label>Capacitacion</label>
                <select
                  value={editForm.capacitacion}
                  onChange={(e) => setEditForm({ ...editForm, capacitacion: e.target.value })}
                >
                  <option value="">-- Seleccione --</option>
                  {CAPACITACIONES.map((cap) => (
                    <option key={cap} value={cap}>{cap}</option>
                  ))}
                </select>
              </div>
              <div className="cert-edit-row">
                <div className="cert-edit-field">
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={editForm.fecha}
                    onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })}
                  />
                </div>
                <div className="cert-edit-field">
                  <label>Hora</label>
                  <input
                    type="time"
                    value={editForm.hora}
                    onChange={(e) => setEditForm({ ...editForm, hora: e.target.value })}
                  />
                </div>
              </div>
              <div className="cert-edit-actions">
                <button type="button" className="cert-edit-cancel" onClick={closeEdit} disabled={savingEdit}>
                  Cancelar
                </button>
                <button type="button" className="cert-edit-save" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="cert-modal-overlay" onClick={closeModal}>
          <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cert-modal-header">
              <h3>Generar Certificados</h3>
              <button type="button" className="cert-modal-close" onClick={closeModal} aria-label="Cerrar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="cert-modal-body">
              {!datos ? (
                <div className="cert-search">
                  <div className="cert-search-row">
                    <div className="cert-search-field">
                      <label>NIT de la empresa</label>
                      <input
                        type="text"
                        placeholder="Ingrese el NIT"
                        value={nit}
                        onChange={(e) => { setNit(e.target.value); setErrorBusqueda(null); }}
                      />
                    </div>
                    <div className="cert-search-field cert-search-field-cap">
                      <label>Tipo de capacitacion</label>
                      <select value={capacitacionSel} onChange={(e) => { setCapacitacionSel(e.target.value); setErrorBusqueda(null); }}>
                        <option value="">-- Seleccione --</option>
                        {CAPACITACIONES.map((cap) => (
                          <option key={cap} value={cap}>{cap}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {errorBusqueda && <p className="cert-error">{errorBusqueda}</p>}

                  <button type="button" className="btn-primary cert-btn-search" onClick={buscarCapacitacion} disabled={buscando}>
                    {buscando ? "Buscando..." : "Buscar capacitacion"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="cert-found">
                    <div className="cert-found-item">
                      <span className="cert-found-label">Empresa</span>
                      <span className="cert-found-value">{datos.empresa}</span>
                    </div>
                    <div className="cert-found-item">
                      <span className="cert-found-label">Capacitacion</span>
                      <span className="cert-found-value">{datos.capacitacion}</span>
                    </div>
                    <div className="cert-found-item">
                      <span className="cert-found-label">Fecha</span>
                      <span className="cert-found-value">{formatFechaCert(datos.fecha)}</span>
                    </div>
                  </div>

                  <div className="cert-upload-area">
                    <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} id="excel-upload" className="cert-file-input" />
                    <label htmlFor="excel-upload" className="cert-file-label">
                      Subir archivo Excel (Nombre, Cedula)
                    </label>
                  </div>

                  {asistentes.length > 0 && (
                    <>
                      <div className="cert-list">
                        <div className="cert-list-header">{asistentes.length} asistentes encontrados</div>
                        <div className="cert-list-body">
                          {asistentes.map((a, i) => (
                            <div className="cert-list-item" key={i}>
                              <span className="cert-list-num">{i + 1}</span>
                              <span className="cert-list-name">{a.nombre}</span>
                              <span className="cert-list-cc">C.C. {a.cedula}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button type="button" className="btn-primary cert-btn-generate" onClick={handleGenerate} disabled={generating}>
                        {generating ? "Generando... 100%" : "Descargar certificados en PDF"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificadoGenerator;
