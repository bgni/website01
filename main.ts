export function add(a: number, b: number): number {
	return a + b;
}

const contentTypeForPath = (path: string): string => {
	const lower = path.toLowerCase();
	if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
	if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
	if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8';
	if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	return 'application/octet-stream';
};

const safePathFromUrl = (url: URL): string => {
	let pathname = decodeURIComponent(url.pathname);
	if (pathname === '/' || pathname === '') pathname = '/index.html';

	// Basic traversal protection.
	if (pathname.includes('..') || pathname.includes('\\')) return '';

	// Strip leading '/'
	return pathname.replace(/^\//, '');
};

if (import.meta.main) {
	const handler = async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		const path = safePathFromUrl(url);
		if (!path) return new Response('Bad Request', { status: 400 });

		try {
			const file = await Deno.readFile(path);
			return new Response(file, {
				status: 200,
				headers: {
					'content-type': contentTypeForPath(path),
					'cache-control': 'no-cache',
				},
			});
		} catch (_err) {
			return new Response('Not Found', { status: 404 });
		}
	};

	const port = 8000;
	Deno.serve({ port }, handler);
	console.log(`Serving on http://localhost:${port}/`);
}

