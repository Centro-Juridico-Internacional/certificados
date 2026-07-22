import { useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import diplomaSgSst from "../assets/diploma-sgsst.png";
import "./CertificadoSgSst.css";

// Relación de aspecto nativa de la plantilla (3508 x 2332 px)
const RATIO = 3508 / 2332;

interface TextoCertificado {
  empresa: string;
  cuerpo1: string;
  cuerpo2: string;
  firma1Nombre: string;
  firma1Cargo: string;
  firma2Nombre: string;
  firma2Cargo: string;
}

const TEXTO_DEFAULT: TextoCertificado = {
  empresa: "",
  cuerpo1:
    "Empresa auditada conforme al Decreto 1072 de 2015, evidenciando el cumplimiento de buenas prácticas en el Sistema de Gestión de seguridad y Salud en el Trabajo (SG-SST).",
  cuerpo2:
    "Certificación expedida con base en la licencia vigente según Resolución No. 24171 del 21 de abril de 2025.",
  firma1Nombre: "María Camila Pulgarín Ramírez",
  firma1Cargo: "Abogada líder coordinadora",
  firma2Nombre: "Stefany Valentina Moreno Valencia",
  firma2Cargo: "Auditora SG-SST",
};

// Tipografías disponibles (fuentes del sistema, se renderizan bien en la descarga)
const FUENTES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Tahoma, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Georgia, serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Garamond", value: "Garamond, 'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const SANS = FUENTES[0].value;
const SERIF = FUENTES[6].value;

interface Estilo {
  font: string;
  size: number; // en cqw (relativo al ancho del certificado)
}

type ClaveEstilo = "empresa" | "cuerpo1" | "cuerpo2" | "firmaNombre" | "firmaCargo";

const ESTILOS_DEFAULT: Record<ClaveEstilo, Estilo> = {
  empresa: { font: SERIF, size: 2.3 },
  cuerpo1: { font: SANS, size: 1.65 },
  cuerpo2: { font: SANS, size: 1.65 },
  firmaNombre: { font: SANS, size: 1.35 },
  firmaCargo: { font: SANS, size: 1.35 },
};

// Convierte un texto libre en un nombre de archivo seguro
const safeFilename = (raw: string, fallback = "SG-SST"): string => {
  if (!raw) return fallback;
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
};

interface Firma {
  img: string | null; // data URL de la imagen de firma
  escala: number;     // tamaño relativo (fracción del ancho del bloque)
}

// Quita el fondo claro de una imagen de firma: los píxeles claros (papel blanco)
// se vuelven transparentes y la tinta oscura se conserva. Devuelve un PNG data URL.
const quitarFondo = (dataUrl: string): Promise<string> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = imgData.data;
        // Umbrales de luminancia: por encima de CLARO = transparente,
        // por debajo de TINTA = opaco; en medio, transición suave (antialias).
        const CLARO = 236;
        const TINTA = 180;
        for (let i = 0; i < px.length; i += 4) {
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          let a = px[i + 3];
          if (lum >= CLARO) {
            a = 0;
          } else if (lum > TINTA) {
            a = Math.min(a, Math.round(((CLARO - lum) / (CLARO - TINTA)) * 255));
          }
          px[i + 3] = a;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

const CertificadoSgSst = () => {
  const [texto, setTexto] = useState<TextoCertificado>(TEXTO_DEFAULT);
  const [estilos, setEstilos] = useState<Record<ClaveEstilo, Estilo>>(ESTILOS_DEFAULT);
  const [firma1, setFirma1] = useState<Firma>({ img: null, escala: 0.75 });
  const [firma2, setFirma2] = useState<Firma>({ img: null, escala: 0.75 });
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const certRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLImageElement>(null);

  const cargarFirma = (setter: React.Dispatch<React.SetStateAction<Firma>>) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        const sinFondo = await quitarFondo(reader.result);
        setter((prev) => ({ ...prev, img: sinFondo }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // permite volver a subir el mismo archivo
  };

  const set = (campo: keyof TextoCertificado) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setTexto((prev) => ({ ...prev, [campo]: e.target.value }));

  const setFont = (clave: ClaveEstilo, font: string) =>
    setEstilos((prev) => ({ ...prev, [clave]: { ...prev[clave], font } }));

  const setSize = (clave: ClaveEstilo, size: number) =>
    setEstilos((prev) => ({ ...prev, [clave]: { ...prev[clave], size } }));

  const cssEstilo = (clave: ClaveEstilo): React.CSSProperties => ({
    fontFamily: estilos[clave].font,
    fontSize: `${estilos[clave].size}cqw`,
  });

  const capturarCanvas = async (): Promise<HTMLCanvasElement> => {
    if (!certRef.current) throw new Error("No se encontró el certificado.");
    if (bgRef.current && !bgRef.current.complete) {
      await bgRef.current.decode().catch(() => undefined);
    }
    return html2canvas(certRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
  };

  const nombreArchivo = () => safeFilename(texto.empresa || "Certificado_SG-SST", "Certificado_SG-SST");

  const descargarPDF = async () => {
    setError(null);
    setDescargando(true);
    try {
      const canvas = await capturarCanvas();
      const imgData = canvas.toDataURL("image/png");
      const anchoMM = 297;
      const altoMM = anchoMM / RATIO;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [anchoMM, altoMM] });
      pdf.addImage(imgData, "PNG", 0, 0, anchoMM, altoMM);
      pdf.save(`${nombreArchivo()}.pdf`);
    } catch (err) {
      console.error("[CertificadoSgSst] Error generando PDF:", err);
      setError("No se pudo generar el certificado. Intente de nuevo.");
    } finally {
      setDescargando(false);
    }
  };

  const descargarPNG = async () => {
    setError(null);
    setDescargando(true);
    try {
      const canvas = await capturarCanvas();
      const link = document.createElement("a");
      link.download = `${nombreArchivo()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("[CertificadoSgSst] Error generando PNG:", err);
      setError("No se pudo generar el certificado. Intente de nuevo.");
    } finally {
      setDescargando(false);
    }
  };

  const restablecer = () => {
    setTexto(TEXTO_DEFAULT);
    setEstilos(ESTILOS_DEFAULT);
    setFirma1({ img: null, escala: 0.75 });
    setFirma2({ img: null, escala: 0.75 });
    setError(null);
  };

  // Control de subida + tamaño de la imagen de firma
  const ControlFirma = ({
    n,
    firma,
    setter,
  }: {
    n: number;
    firma: Firma;
    setter: React.Dispatch<React.SetStateAction<Firma>>;
  }) => (
    <div className="sgsst-field">
      <label>Firma {n} — Imagen (opcional)</label>
      <div className="sgsst-firma-upload">
        <label className="sgsst-file-btn">
          {firma.img ? "Cambiar imagen" : "Subir imagen"}
          <input type="file" accept="image/*" onChange={cargarFirma(setter)} hidden />
        </label>
        {firma.img && (
          <button
            type="button"
            className="sgsst-file-remove"
            onClick={() => setter((prev) => ({ ...prev, img: null }))}
          >
            Quitar
          </button>
        )}
      </div>
      {firma.img && (
        <div className="sgsst-estilo">
          <span className="sgsst-estilo-ico" aria-hidden>⇔</span>
          <input
            type="range"
            min={0.3}
            max={1.5}
            step={0.05}
            value={firma.escala}
            onChange={(e) => setter((prev) => ({ ...prev, escala: Number(e.target.value) }))}
            title="Tamaño de la firma"
            style={{ flex: "1 1 auto", accentColor: "#14324f" }}
          />
          <span className="sgsst-estilo-val">{Math.round(firma.escala * 100)}%</span>
        </div>
      )}
      <span className="sgsst-hint">El fondo claro de la imagen se elimina automáticamente. Ajusta el tamaño con el deslizador.</span>
    </div>
  );

  // Control de tipografía + tamaño para un bloque de texto
  const ControlEstilo = ({ clave }: { clave: ClaveEstilo }) => (
    <div className="sgsst-estilo">
      <select
        className="sgsst-estilo-font"
        value={estilos[clave].font}
        onChange={(e) => setFont(clave, e.target.value)}
        title="Tipografía"
      >
        {FUENTES.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="sgsst-estilo-size">
        <span className="sgsst-estilo-ico" aria-hidden>A</span>
        <input
          type="range"
          min={0.8}
          max={4}
          step={0.05}
          value={estilos[clave].size}
          onChange={(e) => setSize(clave, Number(e.target.value))}
          title="Tamaño"
        />
        <span className="sgsst-estilo-val">{estilos[clave].size.toFixed(2)}</span>
      </div>
    </div>
  );

  return (
    <div className="sgsst-wrap">
      <header className="sgsst-head">
        <h1>Certificados SG-SST</h1>
        <p>
          Edita el texto, la tipografía y el tamaño de cada bloque del certificado de auditoría del
          Sistema de Gestión de Seguridad y Salud en el Trabajo, y descárgalo en PDF o imagen. Este
          módulo es independiente del generador de certificados de capacitaciones.
        </p>
      </header>

      <div className="sgsst-grid">
        {/* Panel de edición */}
        <div className="sgsst-form">
          <h3 className="sgsst-section">Contenido</h3>

          <div className="sgsst-field">
            <label>Empresa (opcional, para el nombre del archivo)</label>
            <input
              type="text"
              value={texto.empresa}
              onChange={set("empresa")}
              placeholder="Ej. Industrias Proton Ltda"
            />
            <span className="sgsst-hint">Si escribes la empresa, aparece como título dentro del certificado.</span>
            <ControlEstilo clave="empresa" />
          </div>

          <div className="sgsst-field">
            <label>Texto principal</label>
            <textarea rows={4} value={texto.cuerpo1} onChange={set("cuerpo1")} />
            <ControlEstilo clave="cuerpo1" />
          </div>

          <div className="sgsst-field">
            <label>Segundo párrafo (resolución / licencia)</label>
            <textarea rows={3} value={texto.cuerpo2} onChange={set("cuerpo2")} />
            <ControlEstilo clave="cuerpo2" />
          </div>

          <h3 className="sgsst-section">Firmantes</h3>

          <div className="sgsst-firmante">
            <span className="sgsst-subtitle">Firmante 1</span>
            <div className="sgsst-row">
              <div className="sgsst-field">
                <label>Nombre</label>
                <input type="text" value={texto.firma1Nombre} onChange={set("firma1Nombre")} />
              </div>
              <div className="sgsst-field">
                <label>Cargo</label>
                <input type="text" value={texto.firma1Cargo} onChange={set("firma1Cargo")} />
              </div>
            </div>
            <ControlFirma n={1} firma={firma1} setter={setFirma1} />
          </div>

          <div className="sgsst-firmante">
            <span className="sgsst-subtitle">Firmante 2</span>
            <div className="sgsst-row">
              <div className="sgsst-field">
                <label>Nombre</label>
                <input type="text" value={texto.firma2Nombre} onChange={set("firma2Nombre")} />
              </div>
              <div className="sgsst-field">
                <label>Cargo</label>
                <input type="text" value={texto.firma2Cargo} onChange={set("firma2Cargo")} />
              </div>
            </div>
            <ControlFirma n={2} firma={firma2} setter={setFirma2} />
          </div>

          <div className="sgsst-field">
            <label>Estilo de los nombres</label>
            <ControlEstilo clave="firmaNombre" />
          </div>
          <div className="sgsst-field">
            <label>Estilo de los cargos</label>
            <ControlEstilo clave="firmaCargo" />
          </div>

          <h3 className="sgsst-section">Descargar</h3>

          <div className="sgsst-actions">
            <button type="button" className="sgsst-btn sgsst-btn-primary" onClick={descargarPDF} disabled={descargando}>
              {descargando ? "Generando..." : "Descargar PDF"}
            </button>
            <button type="button" className="sgsst-btn" onClick={descargarPNG} disabled={descargando}>
              Descargar imagen (PNG)
            </button>
            <button type="button" className="sgsst-btn sgsst-btn-ghost" onClick={restablecer} disabled={descargando}>
              Restablecer todo
            </button>
          </div>

          {error && <p className="sgsst-error">{error}</p>}
        </div>

        {/* Vista previa del certificado */}
        <div className="sgsst-preview">
          <div className="sgsst-canvas" ref={certRef}>
            <img ref={bgRef} src={diplomaSgSst} alt="Plantilla certificado SG-SST" className="sgsst-bg" />

            {texto.empresa.trim() && (
              <div className="sgsst-empresa" style={cssEstilo("empresa")}>
                {texto.empresa}
              </div>
            )}

            <div className="sgsst-body">
              <p style={cssEstilo("cuerpo1")}>{texto.cuerpo1}</p>
              <p style={cssEstilo("cuerpo2")}>{texto.cuerpo2}</p>
            </div>

            {firma1.img && (
              <div className="sgsst-firma-sign sgsst-firma-sign-left">
                <img src={firma1.img} alt="" style={{ width: `${firma1.escala * 100}%` }} />
              </div>
            )}
            {firma2.img && (
              <div className="sgsst-firma-sign sgsst-firma-sign-right">
                <img src={firma2.img} alt="" style={{ width: `${firma2.escala * 100}%` }} />
              </div>
            )}

            <div className="sgsst-firma sgsst-firma-left">
              <span className="sgsst-firma-nombre" style={cssEstilo("firmaNombre")}>{texto.firma1Nombre}</span>
              <span className="sgsst-firma-cargo" style={cssEstilo("firmaCargo")}>{texto.firma1Cargo}</span>
            </div>

            <div className="sgsst-firma sgsst-firma-right">
              <span className="sgsst-firma-nombre" style={cssEstilo("firmaNombre")}>{texto.firma2Nombre}</span>
              <span className="sgsst-firma-cargo" style={cssEstilo("firmaCargo")}>{texto.firma2Cargo}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificadoSgSst;
