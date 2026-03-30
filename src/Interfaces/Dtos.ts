export type CentrosServiciosDelProfesional = {
   IdProfesional: number;
   NombreProfesional: string;
   IdCentroAtencion: number;
   NombreCentroAtencion: string;
   IdServicio: number;
   NombreServicio: string;
}

export type CentrosServiciosPrestacionesDelProfesional = CentrosServiciosDelProfesional & {
   IdPrestacion: number;
   Prestacion: string;
}