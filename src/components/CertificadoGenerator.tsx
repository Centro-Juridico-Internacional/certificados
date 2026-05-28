import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { auth, db } from "../firebase";
import diplomaImg from "../assets/diploma.jpg";
import "./CertificadoGenerator.css";

type TipoDoc = "CC" | "CE";

interface Asistente {
  nombre: string;
  cedula: string;
  tipoDoc: TipoDoc;
}

const normalizeTipoDoc = (raw: string): TipoDoc => {
  const s = raw.trim().toUpperCase().replace(/[.\s]/g, "");
  if (s === "CE" || s.includes("EXTRANJ")) return "CE";
  return "CC";
};

const descargarPlantillaAsistentes = () => {
  const rows = [
    ["Nombre", "Número de documento", "Tipo"],
    ["MARÍA CAMILA CASILIMAS", "1074812954", "CC"],
    ["JEAN PIERRE DUBOIS", "AB123456", "CE"],
    ["LUIS ALBERTO HOYOS RODRÍGUEZ", "80801151", "CC"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 36 }, { wch: 22 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asistentes");
  XLSX.writeFile(wb, "plantilla_asistentes.xlsx");
};

const parseAsistentesExcel = (file: File): Promise<Asistente[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const parsed: Asistente[] = json
          .map((row) => {
            const keys = Object.keys(row);
            return {
              nombre: String(row[keys[0]] ?? "").trim(),
              cedula: String(row[keys[1]] ?? "").trim(),
              tipoDoc: normalizeTipoDoc(String(row[keys[2]] ?? "")),
            };
          })
          .filter((a) => a.nombre.length > 0);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsArrayBuffer(file);
  });

interface DatosCapacitacion {
  // ID del registro en Firestore. Si está presente, al generar certificados
  // con asistentes se persiste el array de asistentes en ese documento para
  // que la zona de afiliados pueda re-generar los certificados después.
  id?: string;
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
  enPapelera: boolean;
  eliminadoEn: Timestamp | null;
  searchIndex: string;
}

const DIAS_RETENCION_PAPELERA = 30;

const MODULO_RAPIDO_HASTA_MS = new Date(2026, 5, 1, 0, 0, 0).getTime();
const MODULO_RAPIDO_ADMIN = "desarrollo@centrojuridicointernacional.com";

const CAPACITACIONES = [
  "REGISTRO Y/O RENOVACIÓN DE MARCA",
  "REGLAMENTO INTERNO DE TRABAJO",
  "MANUAL OBLIGATORIO EMPRESARIAL DE TÉRMINOS Y CONDICIONES",
  "POLÍTICA DE DESCONEXIÓN LABORAL",
  "POLÍTICA DE PROTECCIÓN DE DATOS PERSONALES",
  "PLAN DE CONVIVENCIA Y SEGURIDAD CIUDADANA",
  "PLAN DE ÉTICA Y TRANSPARENCIA",
  "PLAN ESTRATÉGICO DE SEGURIDAD VIAL",
  "POLÍTICA DE ACUERDO DE MEDIOS TECNOLÓGICOS",
  "POLÍTICA DE ALCOHOL Y DROGAS",
  "POLÍTICA DE COMISIONES Y BONIFICACIONES",
  "POLÍTICA DE PERMISOS LICENCIAS E INCAPACIDADES",
  "POLÍTICA DE PREVENCIÓN DEL ACOSO SEXUAL EN EL AMBIENTE LABORAL",
  "POLÍTICA DE PREVENCIÓN Y ATENCIÓN A LA DISCRIMINACIÓN Y ACOSO EN EL AMBIENTE LABORAL",
  "POLÍTICA DE REGLAMENTACIÓN DE MODALIDADES DE CONTRATACIÓN LABORAL NO PRESENCIAL",
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

let diplomaBase64Cache: string | null = null;

const cargarDiplomaBase64 = async (): Promise<string> => {
  if (diplomaBase64Cache) return diplomaBase64Cache;

  const imgResponse = await fetch(diplomaImg);
  if (!imgResponse.ok) {
    throw new Error(`No se pudo descargar el diploma (HTTP ${imgResponse.status})`);
  }
  const imgBlob = await imgResponse.blob();

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve(result);
      } else {
        reject(new Error("El archivo del diploma quedó vacío al leerse"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo el diploma"));
    reader.readAsDataURL(imgBlob);
  });

  // Solo cachear si la carga fue exitosa
  diplomaBase64Cache = base64;
  return base64;
};

// Convierte un nombre de empresa en un nombre de archivo seguro para todos los SO
const safeFilename = (raw: string, fallback = "Empresa"): string => {
  if (!raw) return fallback;
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // quita tildes (marcas diacriticas combinantes)
    .replace(/[/\\:*?"<>|]/g, "")     // chars ilegales en Windows/macOS
    .replace(/[^\w\s.-]/g, "")        // mantiene letras, digitos, _, ., -, espacios
    .replace(/\s+/g, "_")             // espacios -> guion bajo
    .replace(/_+/g, "_")              // colapsa _ múltiples
    .replace(/^[_.-]+|[_.-]+$/g, "")  // recorta separadores al inicio/fin
    .slice(0, 80);                    // límite razonable
  return cleaned || fallback;
};

// Dibuja una página del certificado en el PDF usando las coordenadas del diploma
const dibujarPaginaCertificado = (
  pdf: jsPDF,
  imgBase64: string,
  pdfW: number,
  pdfH: number,
  datos: DatosCapacitacion,
  titulo: string,
  subtitulo: string,
  incluirLineaEmpresa: boolean,
) => {
  pdf.addImage(imgBase64, "JPEG", 0, 0, pdfW, pdfH);
  const cx = pdfW / 2 + 42;

  // Título (nombre del asistente o de la empresa)
  pdf.setFont("times", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(30, 41, 59);
  pdf.text(titulo, cx, 123, { align: "center", maxWidth: 180 });

  // Subtítulo (CC/CE + cédula, o NIT + número)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  pdf.text(subtitulo, cx, 129, { align: "center" });

  // Por su asistencia a la socialización de...
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(30, 30, 30);
  pdf.text(
    `Por su asistencia a la socializacion de ${datos.capacitacion.toLowerCase()}`,
    cx, 138, { align: "center", maxWidth: 180 },
  );

  let testimonioY = 156;
  let fechaY = 162;

  if (incluirLineaEmpresa) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(`De la empresa ${datos.empresa.toUpperCase()}`, cx, 146, { align: "center" });
  } else {
    // Sin línea "De la empresa" → subir el testimonio para compensar el espacio vacío
    testimonioY = 148;
    fechaY = 154;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(30, 30, 30);
  pdf.text(
    "En testimonio de lo expuesto, se expide el siguiente certificado en Bogota D.C.",
    cx, testimonioY, { align: "center" },
  );
  pdf.text(formatFechaCert(datos.fecha), cx, fechaY, { align: "center" });
};

// Genera el PDF usando jsPDF directamente (sin html2canvas ni DOM oculto)
const generarPDF = async (asistentes: Asistente[], datos: DatosCapacitacion) => {
  const imgBase64 = await cargarDiplomaBase64();
  const pdf = new jsPDF("landscape", "mm", "a4");
  const pdfW = pdf.internal.pageSize.getWidth(); // 297
  const pdfH = pdf.internal.pageSize.getHeight(); // 210

  for (let i = 0; i < asistentes.length; i++) {
    if (i > 0) pdf.addPage();
    const a = asistentes[i];
    dibujarPaginaCertificado(
      pdf, imgBase64, pdfW, pdfH, datos,
      a.nombre,
      `${a.tipoDoc}: ${a.cedula}`,
      true,
    );
  }

  pdf.save(`Certificados_${safeFilename(datos.empresa)}.pdf`);
};

const generarPDFEmpresa = async (datos: DatosCapacitacion) => {
  const imgBase64 = await cargarDiplomaBase64();
  const pdf = new jsPDF("landscape", "mm", "a4");
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  dibujarPaginaCertificado(
    pdf, imgBase64, pdfW, pdfH, datos,
    datos.empresa.toUpperCase(),
    `NIT: ${datos.nit}`,
    false,
  );

  pdf.save(`Certificado_Empresa_${safeFilename(datos.empresa)}.pdf`);
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
  const [papeleraOpen, setPapeleraOpen] = useState(false);
  const [editRegistro, setEditRegistro] = useState<RegistroCapacitacion | null>(null);
  const [editForm, setEditForm] = useState({
    empresa: "", nit: "", correo: "", capacitacion: "", fecha: "", hora: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [rapidoOpen, setRapidoOpen] = useState(false);
  const [rapidoForm, setRapidoForm] = useState({
    empresa: "", nit: "", capacitacion: "", fecha: "",
  });
  const [rapidoAsistentes, setRapidoAsistentes] = useState<Asistente[]>([]);
  const [rapidoGenerating, setRapidoGenerating] = useState(false);
  const [rapidoError, setRapidoError] = useState<string | null>(null);
  const [rapidoSuccess, setRapidoSuccess] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const moduloRapidoDisponible =
    Date.now() < MODULO_RAPIDO_HASTA_MS ||
    auth.currentUser?.email?.toLowerCase() === MODULO_RAPIDO_ADMIN;

  useEffect(() => {
    const q = query(collection(db, "capacitaciones"), orderBy("creadoEn", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: RegistroCapacitacion[] = snap.docs.map((d) => {
        const data = d.data();
        const userEmail = String(data.userEmail ?? "");
        const juridico = userEmail.split("@")[0] || "—";
        const empresa = String(data.nombre ?? "");
        const nit = String(data.nit ?? "");
        const capacitacion = String(data.capacitacion ?? "");
        const fecha = String(data.fecha ?? "");
        const correo = String(data.correo ?? "");
        return {
          id: d.id,
          empresa,
          nit,
          capacitacion,
          fecha,
          hora: String(data.hora ?? ""),
          correo,
          juridico,
          creadoEn: (data.creadoEn as Timestamp | undefined) ?? null,
          enPapelera: Boolean(data.enPapelera),
          eliminadoEn: (data.eliminadoEn as Timestamp | undefined) ?? null,
          searchIndex: `${empresa} ${nit} ${correo} ${capacitacion} ${juridico} ${fecha}`.toLowerCase(),
        };
      });
      setRegistros(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const limiteMs = DIAS_RETENCION_PAPELERA * 24 * 60 * 60 * 1000;
    const ahora = Date.now();
    registros.forEach((r) => {
      if (r.enPapelera && r.eliminadoEn) {
        const edad = ahora - r.eliminadoEn.toMillis();
        if (edad > limiteMs) {
          deleteDoc(doc(db, "capacitaciones", r.id)).catch((err) =>
            console.error("Error al limpiar papelera:", err),
          );
        }
      }
    });
  }, [registros]);

  const registrosActivos = useMemo(
    () => registros.filter((r) => !r.enPapelera),
    [registros],
  );

  const registrosPapelera = useMemo(
    () =>
      registros
        .filter((r) => r.enPapelera)
        .sort((a, b) => {
          const ta = a.eliminadoEn ? a.eliminadoEn.toMillis() : 0;
          const tb = b.eliminadoEn ? b.eliminadoEn.toMillis() : 0;
          return tb - ta;
        }),
    [registros],
  );

  const registrosFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return registrosActivos;
    return registrosActivos.filter((r) => r.searchIndex.includes(q));
  }, [registrosActivos, filtro]);

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
      const porNit = registrosActivos.filter((r) => r.nit.trim() === nitBuscar.trim());

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
        id: encontrado.id,
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
      id: r.id,
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
    setSuccessMsg(null);
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

  const moverAPapelera = async (r: RegistroCapacitacion) => {
    const ok = window.confirm(
      `¿Enviar a la papelera la solicitud de "${r.empresa}"?\n\nPodrás restaurarla en los próximos ${DIAS_RETENCION_PAPELERA} días antes de que se elimine definitivamente.`,
    );
    if (!ok) return;
    try {
      await updateDoc(doc(db, "capacitaciones", r.id), {
        enPapelera: true,
        eliminadoEn: Timestamp.now(),
      });
    } catch (err) {
      console.error("Error al enviar a papelera:", err);
    }
  };

  const restaurarDePapelera = async (r: RegistroCapacitacion) => {
    try {
      await updateDoc(doc(db, "capacitaciones", r.id), {
        enPapelera: false,
        eliminadoEn: null,
      });
    } catch (err) {
      console.error("Error al restaurar:", err);
    }
  };

  const eliminarDefinitivo = async (r: RegistroCapacitacion) => {
    const ok = window.confirm(
      `¿Eliminar definitivamente la solicitud de "${r.empresa}"?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "capacitaciones", r.id));
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  };

  const diasRestantesEnPapelera = (eliminadoEn: Timestamp | null): number => {
    if (!eliminadoEn) return DIAS_RETENCION_PAPELERA;
    const transcurridos = (Date.now() - eliminadoEn.toMillis()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(DIAS_RETENCION_PAPELERA - transcurridos));
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

  const closeRapido = () => {
    setRapidoOpen(false);
    setRapidoForm({ empresa: "", nit: "", capacitacion: "", fecha: "" });
    setRapidoAsistentes([]);
    setRapidoError(null);
    setRapidoSuccess(null);
  };

  const handleRapidoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseAsistentesExcel(file);
      setRapidoAsistentes(parsed);
      setRapidoError(null);
    } catch (err) {
      console.error("Error al leer Excel:", err);
      setRapidoError("No se pudo leer el archivo Excel.");
    }
  };

  const validarRapidoBase = (): boolean => {
    if (!rapidoForm.empresa.trim()) {
      setRapidoError("Ingrese el nombre de la empresa.");
      return false;
    }
    if (!rapidoForm.capacitacion) {
      setRapidoError("Seleccione el tipo de capacitación.");
      return false;
    }
    if (!rapidoForm.fecha) {
      setRapidoError("Seleccione la fecha.");
      return false;
    }
    return true;
  };

  const guardarRegistroRapido = async (): Promise<string> => {
    const user = auth.currentUser;
    const ref = await addDoc(collection(db, "capacitaciones"), {
      empresa: rapidoForm.empresa.trim(),
      nombre: rapidoForm.empresa.trim(),
      nit: rapidoForm.nit.trim(),
      capacitacion: rapidoForm.capacitacion,
      fecha: rapidoForm.fecha,
      hora: "",
      correo: user?.email ?? "",
      userId: user?.uid ?? null,
      userEmail: user?.email ?? null,
      creadoEn: serverTimestamp(),
      enPapelera: false,
      eliminadoEn: null,
      origenRapido: true,
    });
    return ref.id;
  };

  const handleRapidoGenerateEmpresa = async () => {
    setRapidoError(null);
    setRapidoSuccess(null);
    if (!validarRapidoBase()) return;
    if (!rapidoForm.nit.trim()) {
      setRapidoError("El N.I.T. es obligatorio para generar el certificado de la empresa.");
      return;
    }

    setRapidoGenerating(true);
    try {
      try {
        await guardarRegistroRapido();
      } catch (err) {
        console.error("[modulo-rapido] Error al guardar en Firestore:", err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`No se pudo guardar el registro en Firestore: ${msg}`);
      }
      try {
        await generarPDFEmpresa({
          empresa: rapidoForm.empresa.trim(),
          nit: rapidoForm.nit.trim(),
          capacitacion: rapidoForm.capacitacion,
          fecha: rapidoForm.fecha,
        });
      } catch (err) {
        console.error("[modulo-rapido] Error al generar PDF empresa:", err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Falla al generar el PDF: ${msg}`);
      }
      setRapidoSuccess("Certificado de empresa descargado 100%");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRapidoError(`Ocurrió un error al generar el certificado de la empresa. Detalle: ${msg}`);
    } finally {
      setRapidoGenerating(false);
    }
  };

  const handleRapidoGenerate = async () => {
    setRapidoError(null);
    setRapidoSuccess(null);
    if (!validarRapidoBase()) return;
    if (rapidoAsistentes.length === 0) {
      setRapidoError("Suba el archivo de Excel con los asistentes.");
      return;
    }

    setRapidoGenerating(true);
    try {
      let registroId: string;
      try {
        registroId = await guardarRegistroRapido();
      } catch (err) {
        console.error("[modulo-rapido] Error al guardar en Firestore:", err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`No se pudo guardar el registro en Firestore: ${msg}`);
      }
      try {
        await generarPDF(rapidoAsistentes, {
          empresa: rapidoForm.empresa.trim(),
          nit: rapidoForm.nit.trim(),
          capacitacion: rapidoForm.capacitacion,
          fecha: rapidoForm.fecha,
        });
      } catch (err) {
        console.error("[modulo-rapido] Error al generar PDF:", err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Falla al generar el PDF: ${msg}`);
      }
      // Persistir los asistentes en el registro para que la zona de afiliados
      // pueda re-generar los certificados individuales después.
      try {
        await updateDoc(doc(db, "capacitaciones", registroId), {
          asistentes: rapidoAsistentes,
        });
      } catch (err) {
        console.error("[modulo-rapido] Error al actualizar asistentes:", err);
        // No relanzar: el PDF ya se descargó, solo es persistencia para la zona de afiliados
      }
      setRapidoSuccess(`Certificados descargados 100% (${rapidoAsistentes.length} asistentes)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRapidoError(`Ocurrió un error al generar el PDF. Detalle: ${msg}`);
    } finally {
      setRapidoGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseAsistentesExcel(file);
      setAsistentes(parsed);
    } catch (err) {
      console.error("Error al leer Excel:", err);
    }
  };

  const handleGenerate = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!datos || asistentes.length === 0) return;
    setSuccessMsg(null);
    setErrorBusqueda(null);
    setGenerating(true);
    try {
      await generarPDF(asistentes, datos);
      // Persistir los asistentes en el registro para que la zona de afiliados
      // pueda re-generar los certificados individuales después.
      if (datos.id) {
        await updateDoc(doc(db, "capacitaciones", datos.id), {
          asistentes,
        });
      }
      setSuccessMsg(`Certificados descargados 100% (${asistentes.length} asistentes)`);
    } catch (err) {
      console.error("Error al generar PDF:", err);
      setErrorBusqueda("Ocurrió un error al generar el PDF.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateEmpresa = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!datos) return;
    setSuccessMsg(null);
    setErrorBusqueda(null);
    if (!datos.nit.trim()) {
      setErrorBusqueda("El N.I.T. es obligatorio para generar el certificado de la empresa.");
      return;
    }
    setGenerating(true);
    try {
      await generarPDFEmpresa(datos);
      setSuccessMsg("Certificado de empresa descargado 100%");
    } catch (err) {
      console.error("Error al generar PDF empresa:", err);
      setErrorBusqueda("Ocurrió un error al generar el certificado de la empresa.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="cert-card notranslate" translate="no">
      <div className="cert-card-header">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        <div>
          <h2>Generar Certificados</h2>
          <p>Busque la capacitacion por NIT y suba el listado de asistentes.</p>
        </div>
      </div>

      <div className="cert-body">
        {moduloRapidoDisponible && (
          <div className="cert-rapido-banner">
            <div className="cert-rapido-banner-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div className="cert-rapido-banner-text">
              <h3>Generar certificados al instante</h3>
              <p>Ingresa los datos manualmente, sube el Excel y descarga los certificados sin necesidad de registrar una solicitud. Disponible hasta el domingo 31 de mayo de 2026.</p>
            </div>
            <button
              type="button"
              className="cert-rapido-banner-btn"
              onClick={() => setRapidoOpen(true)}
            >
              Abrir módulo rápido
            </button>
          </div>
        )}

        <div className="cert-registros">
          <div className="cert-registros-header">
            <h3>Solicitudes de capacitacion registradas</h3>
            <span className="cert-registros-count">
              {filtro ? `${registrosFiltrados.length} / ${registrosActivos.length}` : registrosActivos.length}
            </span>
            <button
              type="button"
              className="cert-papelera-btn"
              onClick={() => setPapeleraOpen(true)}
              aria-label="Abrir papelera"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
              Papelera
              {registrosPapelera.length > 0 && (
                <span className="cert-papelera-badge">{registrosPapelera.length}</span>
              )}
            </button>
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
                          <button
                            type="button"
                            className="cert-registros-btn cert-registros-btn-delete"
                            onClick={() => moverAPapelera(r)}
                            aria-label="Eliminar"
                          >
                            Eliminar
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

      {rapidoOpen && moduloRapidoDisponible && (
        <div className="cert-modal-overlay" onClick={closeRapido}>
          <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cert-modal-header">
              <h3>Generar certificados — modo rápido</h3>
              <button
                type="button"
                className="cert-modal-close"
                onClick={closeRapido}
                aria-label="Cerrar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="cert-modal-body">
              <div className="cert-rapido-section">
                <div className="cert-rapido-section-title">Datos de la empresa</div>
                <div className="cert-edit-field">
                  <label>Empresa</label>
                  <input
                    type="text"
                    placeholder="Nombre de la empresa"
                    value={rapidoForm.empresa}
                    onChange={(e) => setRapidoForm({ ...rapidoForm, empresa: e.target.value })}
                  />
                </div>
                <div className="cert-edit-row">
                  <div className="cert-edit-field">
                    <label>N.I.T. (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. 900123456"
                      value={rapidoForm.nit}
                      onChange={(e) => setRapidoForm({ ...rapidoForm, nit: e.target.value })}
                    />
                  </div>
                  <div className="cert-edit-field">
                    <label>Fecha</label>
                    <input
                      type="date"
                      value={rapidoForm.fecha}
                      onChange={(e) => setRapidoForm({ ...rapidoForm, fecha: e.target.value })}
                    />
                  </div>
                </div>
                <div className="cert-edit-field">
                  <label>Capacitación</label>
                  <select
                    value={rapidoForm.capacitacion}
                    onChange={(e) => setRapidoForm({ ...rapidoForm, capacitacion: e.target.value })}
                  >
                    <option value="">-- Seleccione --</option>
                    {CAPACITACIONES.map((cap) => (
                      <option key={cap} value={cap}>{cap}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cert-rapido-section">
                <div className="cert-rapido-section-title">Asistentes</div>
                <div className="cert-upload-area">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleRapidoFileUpload}
                    id="rapido-excel-upload"
                    className="cert-file-input"
                  />
                  <label htmlFor="rapido-excel-upload" className="cert-file-label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {rapidoAsistentes.length > 0
                      ? `Cambiar archivo (${rapidoAsistentes.length} asistentes cargados)`
                      : "Subir archivo Excel"}
                  </label>
                  <p className="cert-upload-help">
                    El archivo debe tener <strong>3 columnas</strong>: <strong>Nombre</strong>, <strong>Número de documento</strong> y <strong>Tipo</strong> (CC o CE). Si omites la tercera columna, todos los asistentes se registran como CC.
                  </p>
                  <button
                    type="button"
                    className="cert-plantilla-btn"
                    onClick={descargarPlantillaAsistentes}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Descargar plantilla Excel
                  </button>
                </div>

                {rapidoAsistentes.length > 0 && (
                  <div className="cert-list">
                    <div className="cert-list-header">{rapidoAsistentes.length} asistentes encontrados</div>
                    <div className="cert-list-body">
                      {rapidoAsistentes.map((a, i) => (
                        <div className="cert-list-item" key={i}>
                          <span className="cert-list-num">{i + 1}</span>
                          <span className="cert-list-name">{a.nombre}</span>
                          <select
                            className="cert-list-tipo"
                            value={a.tipoDoc}
                            onChange={(e) => {
                              const nuevoTipo = e.target.value as TipoDoc;
                              setRapidoAsistentes((prev) =>
                                prev.map((x, idx) => (idx === i ? { ...x, tipoDoc: nuevoTipo } : x)),
                              );
                            }}
                            aria-label="Tipo de documento"
                          >
                            <option value="CC">CC</option>
                            <option value="CE">CE</option>
                          </select>
                          <span className="cert-list-cc">{a.cedula}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {rapidoError && <p className="cert-error">{rapidoError}</p>}
              {rapidoSuccess && (
                <div className="cert-success">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {rapidoSuccess}
                </div>
              )}

              <div className="cert-btn-group">
                <button
                  type="button"
                  className="cert-btn-generate"
                  onClick={handleRapidoGenerate}
                  disabled={rapidoGenerating}
                >
                  {rapidoGenerating ? (
                    "Generando..."
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Descargar certificados
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="cert-btn-generate cert-btn-generate-alt"
                  onClick={handleRapidoGenerateEmpresa}
                  disabled={rapidoGenerating}
                >
                  {rapidoGenerating ? (
                    "Generando..."
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M13 9h.01"/><path d="M9 13h.01"/><path d="M13 13h.01"/><path d="M9 17h.01"/><path d="M13 17h.01"/></svg>
                      Certificado de empresa
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {papeleraOpen && (
        <div className="cert-modal-overlay" onClick={() => setPapeleraOpen(false)}>
          <div className="cert-modal cert-papelera-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cert-modal-header">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 8 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                Papelera
              </h3>
              <button
                type="button"
                className="cert-modal-close"
                onClick={() => setPapeleraOpen(false)}
                aria-label="Cerrar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="cert-modal-body">
              <p className="cert-papelera-info">
                Los elementos se eliminan definitivamente después de {DIAS_RETENCION_PAPELERA} días en la papelera.
              </p>
              {registrosPapelera.length === 0 ? (
                <p className="cert-registros-empty">La papelera está vacía.</p>
              ) : (
                <div className="cert-papelera-list">
                  {registrosPapelera.map((r) => {
                    const dias = diasRestantesEnPapelera(r.eliminadoEn);
                    return (
                      <div key={r.id} className="cert-papelera-item">
                        <div className="cert-papelera-info-col">
                          <div className="cert-papelera-empresa">{r.empresa}</div>
                          <div className="cert-papelera-meta">
                            <span>NIT: {r.nit}</span>
                            <span>•</span>
                            <span title={r.capacitacion}>{r.capacitacion}</span>
                          </div>
                          <div className="cert-papelera-dias">
                            {dias > 0
                              ? `Se eliminará en ${dias} día${dias === 1 ? "" : "s"}`
                              : "Se eliminará pronto"}
                          </div>
                        </div>
                        <div className="cert-papelera-actions">
                          <button
                            type="button"
                            className="cert-registros-btn cert-registros-btn-edit"
                            onClick={() => restaurarDePapelera(r)}
                          >
                            Restaurar
                          </button>
                          <button
                            type="button"
                            className="cert-registros-btn cert-registros-btn-delete"
                            onClick={() => eliminarDefinitivo(r)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                      Subir archivo Excel
                    </label>
                    <p className="cert-upload-help">
                      El archivo debe tener <strong>3 columnas</strong>: <strong>Nombre</strong>, <strong>Número de documento</strong> y <strong>Tipo</strong> (CC o CE). Si omites la tercera columna, todos los asistentes se registran como CC.
                    </p>
                    <button
                      type="button"
                      className="cert-plantilla-btn"
                      onClick={descargarPlantillaAsistentes}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Descargar plantilla Excel
                    </button>
                  </div>

                  {asistentes.length > 0 && (
                    <div className="cert-list">
                      <div className="cert-list-header">{asistentes.length} asistentes encontrados</div>
                      <div className="cert-list-body">
                        {asistentes.map((a, i) => (
                          <div className="cert-list-item" key={i}>
                            <span className="cert-list-num">{i + 1}</span>
                            <span className="cert-list-name">{a.nombre}</span>
                            <select
                              className="cert-list-tipo"
                              value={a.tipoDoc}
                              onChange={(e) => {
                                const nuevoTipo = e.target.value as TipoDoc;
                                setAsistentes((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, tipoDoc: nuevoTipo } : x)),
                                );
                              }}
                              aria-label="Tipo de documento"
                            >
                              <option value="CC">CC</option>
                              <option value="CE">CE</option>
                            </select>
                            <span className="cert-list-cc">{a.cedula}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {successMsg && (
                    <div className="cert-success">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {successMsg}
                    </div>
                  )}

                  <div className="cert-btn-group">
                    <button
                      type="button"
                      className="cert-btn-generate"
                      onClick={handleGenerate}
                      disabled={generating || asistentes.length === 0}
                    >
                      {generating ? (
                        "Generando..."
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Descargar certificados
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="cert-btn-generate cert-btn-generate-alt"
                      onClick={handleGenerateEmpresa}
                      disabled={generating}
                    >
                      {generating ? (
                        "Generando..."
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M13 9h.01"/><path d="M9 13h.01"/><path d="M13 13h.01"/><path d="M9 17h.01"/><path d="M13 17h.01"/></svg>
                          Certificado de empresa
                        </>
                      )}
                    </button>
                  </div>
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
