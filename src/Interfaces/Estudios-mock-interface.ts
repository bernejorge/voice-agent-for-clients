export interface TurnosResponse {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: TurnoData[];
  SessionId: string;
}

export interface TurnoData {
  Id: number;
  Appointment: string;
  IdTurno: number;
  PuedeAnular: boolean;
  Estado: string;
  Fecha: string;
  Hora: string;
  Centro: string;
  Especialidad: string;
  Prestacion: string | null;
  PrimerPrestacionRealizable: string;
  SegundaPrestacionRealizable: string;
  EspePrestacion: string;
  Profesional: string;
  Cobertura: Cobertura;
  PreparacionMédica: string | null;
  RequisitosAdm: string | null;
  IdRecurso: number;
  IdPrestacion: number;
  IdEspecialidad: number;
  IdCobertura: number;
  IdCentro: number;
  ObservacionesServicio: string;
  ObservacionesProfesional: string;
  ServicioCentroHabilitado: boolean;
  PertenenciaHabilitada: boolean;
  IdServicio: number;
  IdProfesional: number;
  DuracionTurno: number;
  CentroInfo: unknown | null;
  AplicaParaTelemedicina: boolean;
  Prestaciones: PrestacionTurno[];
  HabilitadoTurnosWeb: boolean;
  PrestacionesRealizables: string;
  SessionId: string | null;
}

export interface Cobertura {
  Id: number;
  Nombre: string | null;
  NombreCompleto: string | null;
  Sigla: string | null;
  DisponibleEnTurnosWeb: boolean;
  NombrePlan: string | null;
  SiglaConPlan: string | null;
}

export interface PrestacionTurno {
  Id: number;
  Nombre: string;
  InstruccionPreparacion: string | null;
  HabilitadoTurnosWeb: boolean;
  RecursoTrabajaPrestacion: boolean;
  SoloPrestacionConsulta: boolean;
}

export const mockTurnosResponse: TurnosResponse = {
  draw: 0,
  recordsTotal: 2,
  recordsFiltered: 2,
  data: [
    {
      Id: 20617705,
      Appointment:
        "https://PortalPaciente.hospitalprivado.com.ar/AutoRecepcion/Inicio/wEvUl84rtRRzPrwAsvmRPXRAdicC72fH",
      IdTurno: 0,
      PuedeAnular: true,
      Estado: "Libre",
      Fecha: "25/05/2026",
      Hora: "11:00",
      Centro: "Central",
      Especialidad: "CARDIOLOGIA - ADULTOS",
      Prestacion: null,
      PrimerPrestacionRealizable: "",
      SegundaPrestacionRealizable: "",
      EspePrestacion: "CARDIOLOGIA - ADULTOS",
      Profesional: "ERGOMETRIA, EQUIPO",
      Cobertura: {
        Id: 0,
        Nombre: null,
        NombreCompleto: null,
        Sigla: null,
        DisponibleEnTurnosWeb: false,
        NombrePlan: null,
        SiglaConPlan: null,
      },
      PreparacionMédica: null,
      RequisitosAdm: null,
      IdRecurso: 16726,
      IdPrestacion: 0,
      IdEspecialidad: 421,
      IdCobertura: 0,
      IdCentro: 14,
      ObservacionesServicio: "Sin observaciones",
      ObservacionesProfesional:
        "Se realiza en Centro de Practicas. Leer las instrucciones del estudio.",
      ServicioCentroHabilitado: true,
      PertenenciaHabilitada: true,
      IdServicio: 421,
      IdProfesional: 16726,
      DuracionTurno: 30,
      CentroInfo: null,
      AplicaParaTelemedicina: false,
      Prestaciones: [
        {
          Id: 894736,
          Nombre: "ERGOMETRIA COMPUTARIZADA",
          InstruccionPreparacion:
            "<p>Debe concurrir al estudio con ropa y calzado cómodo. No debe concurrir en ayunas.</p>",
          HabilitadoTurnosWeb: true,
          RecursoTrabajaPrestacion: true,
          SoloPrestacionConsulta: false,
        },
      ],
      HabilitadoTurnosWeb: true,
      PrestacionesRealizables: "",
      SessionId: null,
    },
    {
      Id: 20624157,
      Appointment:
        "https://PortalPaciente.hospitalprivado.com.ar/AutoRecepcion/Inicio/wEvUl84rtRRzPrZgsvszP7zAdecL726H",
      IdTurno: 0,
      PuedeAnular: true,
      Estado: "Libre",
      Fecha: "25/05/2026",
      Hora: "12:30",
      Centro: "Central",
      Especialidad: "CARDIOLOGIA - ADULTOS",
      Prestacion: null,
      PrimerPrestacionRealizable: "",
      SegundaPrestacionRealizable: "",
      EspePrestacion: "CARDIOLOGIA - ADULTOS",
      Profesional: "ERGOMETRIA, EQUIPO II",
      Cobertura: {
        Id: 0,
        Nombre: null,
        NombreCompleto: null,
        Sigla: null,
        DisponibleEnTurnosWeb: false,
        NombrePlan: null,
        SiglaConPlan: null,
      },
      PreparacionMédica: null,
      RequisitosAdm: null,
      IdRecurso: 18964,
      IdPrestacion: 0,
      IdEspecialidad: 421,
      IdCobertura: 0,
      IdCentro: 14,
      ObservacionesServicio: "Sin observaciones",
      ObservacionesProfesional:
        "Se realiza en Centro de Practicas. Leer las instrucciones del estudio.",
      ServicioCentroHabilitado: true,
      PertenenciaHabilitada: true,
      IdServicio: 421,
      IdProfesional: 18964,
      DuracionTurno: 30,
      CentroInfo: null,
      AplicaParaTelemedicina: false,
      Prestaciones: [
        {
          Id: 894736,
          Nombre: "ERGOMETRIA COMPUTARIZADA",
          InstruccionPreparacion:
            "<p>Debe concurrir al estudio con ropa y calzado cómodo. No debe concurrir en ayunas.</p>",
          HabilitadoTurnosWeb: true,
          RecursoTrabajaPrestacion: true,
          SoloPrestacionConsulta: false,
        },
      ],
      HabilitadoTurnosWeb: true,
      PrestacionesRealizables: "",
      SessionId: null,
    },
  ],
  SessionId: "7635cb85-af04-4139-a213-813dae21d56c",
};

export function getMockTurnosResponse(): TurnosResponse {
  return mockTurnosResponse;
}

export function getMockTurnosData(): TurnoData[] {
  return mockTurnosResponse.data;
}