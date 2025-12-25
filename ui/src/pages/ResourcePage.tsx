import { useParams, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export default function ResourcePage() {
  const { name } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const limit = 10;

  const { data, error, isLoading } = useSWR(
    `/${name}?page=${page}&limit=${limit}`,
    fetcher
  );

  if (error)
    return <div className="text-destructive">Failed to load resource.</div>;
  if (!data && isLoading)
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const { data: items, meta } = data;

  if (!items || items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight capitalize">
            {name}
          </h2>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No data found for this resource.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper to extract headers from the first item
  const headers = Object.keys(items[0]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight capitalize">{name}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data View</CardTitle>
          <CardDescription>Viewing {meta.total} records.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead
                    key={header}
                    className="capitalize whitespace-nowrap"
                  >
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any, idx: number) => (
                <TableRow key={idx}>
                  {headers.map((header) => (
                    <TableCell
                      key={`${idx}-${header}`}
                      className="max-w-[200px] truncate"
                    >
                      {typeof item[header] === "object"
                        ? JSON.stringify(item[header])
                        : String(item[header])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSearchParams({ page: String(Math.max(1, page - 1)) })
          }
          disabled={page <= 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSearchParams({
              page: String(Math.min(meta.totalPages, page + 1)),
            })
          }
          disabled={page >= meta.totalPages}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
