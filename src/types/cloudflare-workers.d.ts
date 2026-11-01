declare module 'cloudflare:workers' {
  export const env: {
    IMAGES?: {
      info(stream: ReadableStream): Promise<{ width: number; height: number }>;
      input(stream: ReadableStream): {
        transform(options: { width: number; height: number; fit: 'scale-down' }): {
          output(options: { format: 'image/webp'; quality: number; anim: false }): Promise<{ response(): Response }>;
        };
      };
    };
  };
}
