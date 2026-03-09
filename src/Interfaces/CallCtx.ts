export type CallCtx = { 
   callId: string; 
   sipHost?: string;
   phoneNumber?: string;
   pacientes?: datosPaciente[]; // Agregamos un campo para almacenar los datos del paciente, incluyendo su DNI, nombre, ID de persona y cobertura. 
};

type datosPaciente = {
   dni: string,
   IdPersona: number,
   nombre: string,
   coberturas: cobertura[],
}

type cobertura ={
   IdCobertura: number,
   nombre: string,
   plan: string,
}