'use server';

import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { createAuditLog } from '@/lib/audit';
import { MessageRouter } from '@/services/comms/MessageRouter';
import { addMinutes } from 'date-fns';
import { supabase } from '@/lib/storage';

export async function registerUser(data: { fullName: string; pin: string; email: string }) {
  const { fullName, pin, email } = data;

  if (!fullName || !pin || !email) {
    return { success: false, error: 'Faltan campos obligatorios' };
  }

  if (pin.length < 4) {
    return { success: false, error: 'El PIN debe tener al menos 4 dígitos' };
  }

  try {
    // 1. Verificar si el usuario ya existe
    const existingUser = await prisma.user.findFirst({
      where: { 
        OR: [
          { fullName },
          { email }
        ]
      },
    });

    if (existingUser) {
      return { success: false, error: 'El nombre de usuario o correo ya están registrados' };
    }

    // 2. Obtener o crear una organización por defecto
    let organization = await prisma.organization.findFirst();
    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: 'Organización Maestra',
        }
      });
    }

    // 3. Encriptar PIN
    const pinHash = await hash(pin, 12);

    // 4. Crear Usuario (Rol LEADER por defecto, Inactivo para aprobación)
    const newUser = await prisma.user.create({
      data: {
        fullName,
        pinHash,
        email,
        organizationId: organization.id,
        role: 'LEADER',
        isActive: false, // CRÍTICO: Requiere aprobación del Admin
      },
    });

    // 5. Auditoría
    await createAuditLog(
      'SYSTEM',
      'USER_SIGNUP_REQUEST',
      'User',
      newUser.id,
      { msg: `Nueva solicitud de registro: ${fullName}` }
    );

    return { success: true };
  } catch (error: any) {
    console.error('Registration Error:', error);
    return { success: false, error: 'Error al procesar el registro' };
  }
}

/**
 * Solicita un código de recuperación enviado al correo vía Supabase Auth.
 */
export async function requestRecovery(email: string) {
  if (!email) return { success: false, error: 'El correo es obligatorio' };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: 'No se encontró un usuario vinculado a este correo.' };
    }

    // Usar Supabase Auth para enviar OTP vía Email
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
    });

    if (error) {
      console.error('Supabase Email OTP Error:', error);
      return { success: false, error: 'Error al enviar el correo de recuperación vía Supabase.' };
    }

    await createAuditLog(user.id, 'RECOVERY_REQUESTED_EMAIL', 'User', user.id, { email });

    return { success: true };
  } catch (error) {
    console.error('Recovery Request Error:', error);
    return { success: false, error: 'Error interno al procesar recuperación' };
  }
}

/**
 * Verifica el código vía Supabase y restablece el PIN en Prisma.
 */
export async function resetPinWithCode(email: string, code: string, newPin: string) {
  if (!email || !code || !newPin) return { success: false, error: 'Todos los campos son obligatorios' };

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    // Verificar OTP con Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
    });

    if (error || !data.user) {
      console.error('Supabase Verify Error:', error);
      return { success: false, error: 'Código de verificación inválido o expirado' };
    }

    // Una vez verificado por Supabase, actualizamos nuestro PIN local en Prisma
    const pinHash = await hash(newPin, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pinHash,
        pinAttempts: 0,
        pinLockedUntil: null,
        recoveryCode: null,
        recoveryExpires: null
      },
    });

    await createAuditLog(user.id, 'PASSWORD_RESET_EMAIL', 'User', user.id, { msg: 'PIN restablecido exitosamente tras verificar correo con Supabase' });

    return { 
      success: true, 
      fullName: user.fullName 
    };
  } catch (error) {
    console.error('Reset PIN Error:', error);
    return { success: false, error: 'Error al restablecer el PIN' };
  }
}


