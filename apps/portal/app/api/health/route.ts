export function GET() {
  return Response.json({ status: "healthy", service: "mwanamke-portal", sensitiveDataReadable: false });
}
