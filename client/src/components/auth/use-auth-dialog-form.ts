import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { z } from "zod";

import type { AuthMessages } from "@/locales/messages";

type ValidationMessages = AuthMessages["dialog"]["validation"];

export type AuthDialogMode = "sign-in" | "sign-up";

export interface AuthDialogFormState {
  email: string;
  password: string;
  name: string;
}

export interface AuthDialogFormOptions {
  validation: ValidationMessages;
}

export interface AuthDialogFormHook {
  formState: AuthDialogFormState;
  handleFieldChange: (field: keyof AuthDialogFormState) => (event: ChangeEvent<HTMLInputElement>) => void;
  resetForm: () => void;
  validateSignIn: () => ValidationResult<SignInFormData>;
  validateSignUp: () => ValidationResult<SignUpFormData>;
  validateEmailOnly: () => ValidationResult<EmailFormData>;
}

export interface SignInFormData {
  email: string;
  password: string;
}

export interface SignUpFormData extends SignInFormData {
  name?: string;
}

export interface EmailFormData {
  email: string;
}

interface ValidationFailure {
  success: false;
  error: string;
}

interface ValidationSuccess<T> {
  success: true;
  data: T;
}

type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

const INITIAL_FORM_STATE: AuthDialogFormState = {
  email: "",
  password: "",
  name: "",
};

export function useAuthDialogForm(options: AuthDialogFormOptions): AuthDialogFormHook {
  const [formState, setFormState] = useState<AuthDialogFormState>(INITIAL_FORM_STATE);

  const signInSchema = useMemo(() => createSignInSchema(options.validation), [options.validation]);
  const signUpSchema = useMemo(() => createSignUpSchema(options.validation), [options.validation]);
  const emailSchema = useMemo(() => createEmailSchema(options.validation), [options.validation]);

  const handleFieldChange = useCallback(
    (field: keyof AuthDialogFormState) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setFormState((previous) => ({ ...previous, [field]: value }));
      },
    [],
  );

  const resetForm = useCallback(() => {
    setFormState(INITIAL_FORM_STATE);
  }, []);

  const validateSignIn = useCallback((): ValidationResult<SignInFormData> => {
    const result = signInSchema.safeParse(formState);
    if (!result.success) {
      return { success: false, error: extractFirstIssueMessage(result.error, options.validation) };
    }

    return { success: true, data: result.data };
  }, [formState, options.validation, signInSchema]);

  const validateSignUp = useCallback((): ValidationResult<SignUpFormData> => {
    const result = signUpSchema.safeParse(formState);
    if (!result.success) {
      return { success: false, error: extractFirstIssueMessage(result.error, options.validation) };
    }

    const { name, email, password } = result.data;
    const trimmedName = name?.trim();

    return {
      success: true,
      data: {
        email,
        password,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : undefined,
      },
    };
  }, [formState, options.validation, signUpSchema]);

  const validateEmailOnly = useCallback((): ValidationResult<EmailFormData> => {
    const result = emailSchema.safeParse(formState);
    if (!result.success) {
      return { success: false, error: extractFirstIssueMessage(result.error, options.validation) };
    }

    return { success: true, data: { email: result.data.email } };
  }, [emailSchema, formState, options.validation]);

  return { formState, handleFieldChange, resetForm, validateSignIn, validateSignUp, validateEmailOnly };
}

function createSignInSchema(validation: ValidationMessages) {
  return z
    .object({
      email: z.string().trim().min(1, validation.emailRequired),
      password: z.string().min(1, validation.passwordRequired),
      name: z.string().optional(),
    })
    .transform(({ email, password }) => ({ email, password } satisfies SignInFormData));
}

function createSignUpSchema(validation: ValidationMessages) {
  return z
    .object({
      email: z.string().trim().min(1, validation.emailRequired),
      password: z.string().min(1, validation.passwordRequired),
      name: z.string().optional(),
    })
    .transform(({ email, password, name }) => ({
      email,
      password,
      name,
    } satisfies SignUpFormData));
}

function createEmailSchema(validation: ValidationMessages) {
  return z
    .object({
      email: z.string().trim().min(1, validation.emailRequired),
      password: z.string().optional(),
      name: z.string().optional(),
    })
    .transform(({ email }) => ({ email } satisfies EmailFormData));
}

function extractFirstIssueMessage(error: z.ZodError<unknown>, validation: ValidationMessages): string {
  const [issue] = error.issues;
  if (issue?.message) {
    return issue.message;
  }
  return validation.emailRequired;
}
