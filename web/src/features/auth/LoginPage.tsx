import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { homePathFor } from '@/features/auth/guards';
import { setSession, type SessionUser } from '@/lib/session';

const loginSchema = z.object({
  email: z.email('Masukkan email yang valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

type LoginValues = z.infer<typeof loginSchema>;

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message) return message;
    if (!error.response) return 'Tidak dapat menghubungi server. Coba lagi.';
  }
  return 'Login gagal. Coba lagi.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', values);
      setSession({ accessToken: data.accessToken, user: data.user });
      navigate(homePathFor(data.user.role), { replace: true });
    } catch (error) {
      setFormError(loginErrorMessage(error));
    }
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Absensi WFH</CardTitle>
          <CardDescription>Masuk untuk melanjutkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="nama@dexa.test"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
