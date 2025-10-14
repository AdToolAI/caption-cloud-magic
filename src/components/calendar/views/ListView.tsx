import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
  campaign_id?: string;
  owner_id?: string;
}

interface ListViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onPostDelete?: (postId: string) => void;
  onPostDuplicate?: (post: Post) => void;
  readOnly?: boolean;
}

type SortField = "title" | "status" | "start_at" | "channels";
type SortDirection = "asc" | "desc";

const statusColors: Record<string, string> = {
  briefing: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  pending_approval: "bg-orange-500",
  approved: "bg-green-500",
  scheduled: "bg-indigo-500",
  published: "bg-purple-500",
};

export function ListView({
  posts,
  onPostClick,
  onPostDelete,
  onPostDuplicate,
  readOnly,
}: ListViewProps) {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("start_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedPosts = [...posts].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === "channels") {
      aVal = a.channels.join(", ");
      bVal = b.channels.join(", ");
    }

    if (sortDirection === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === posts.length) {
    setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  };

  if (isMobile) {
    return (
      <div className="space-y-3">
        {sortedPosts.map((post) => (
          <Card key={post.id} className="p-4" onClick={() => onPostClick(post)}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <Badge
                  variant="outline"
                  className={`${statusColors[post.status]} text-white mb-2`}
                >
                  {post.status}
                </Badge>
                <div className="font-medium">{post.title}</div>
                <div className="text-sm text-muted-foreground">
                  {post.start_at
                    ? format(new Date(post.start_at), "MMM d, yyyy HH:mm")
                    : "-"}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 bg-popover">
                  <DropdownMenuItem onClick={() => onPostClick(post)}>
                    Edit
                  </DropdownMenuItem>
                  {onPostDuplicate && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostDuplicate(post);
                      }}
                      disabled={readOnly}
                    >
                      Duplicate
                    </DropdownMenuItem>
                  )}
                  {onPostDelete && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostDelete(post.id);
                      }}
                      disabled={readOnly}
                      className="text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap gap-1">
              {post.channels.map((channel) => (
                <Badge key={channel} variant="secondary" className="text-xs">
                  {channel}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <Button variant="outline" size="sm" disabled={readOnly}>
            Delete Selected
          </Button>
          <Button variant="outline" size="sm" disabled={readOnly}>
            Change Status
          </Button>
        </div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.size === posts.length && posts.length > 0}
                  onCheckedChange={toggleSelectAll}
                  disabled={readOnly}
                />
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("title")}
                  className="h-8 gap-1"
                >
                  Title
                  <ArrowUpDown className="w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("status")}
                  className="h-8 gap-1"
                >
                  Status
                  <ArrowUpDown className="w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("channels")}
                  className="h-8 gap-1"
                >
                  Channels
                  <ArrowUpDown className="w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("start_at")}
                  className="h-8 gap-1"
                >
                  Date
                  <ArrowUpDown className="w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPosts.map((post) => (
              <TableRow
                key={post.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onPostClick(post)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(post.id)}
                    onCheckedChange={() => toggleSelect(post.id)}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell className="font-medium">{post.title}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`${statusColors[post.status]} text-white`}
                  >
                    {post.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {post.channels.map((channel) => (
                      <Badge key={channel} variant="secondary" className="text-xs">
                        {channel}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {post.start_at
                    ? format(new Date(post.start_at), "MMM d, yyyy HH:mm")
                    : "-"}
                </TableCell>
                <TableCell>{post.campaign_id || "-"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onPostClick(post)}>
                        Edit
                      </DropdownMenuItem>
                      {onPostDuplicate && (
                        <DropdownMenuItem
                          onClick={() => onPostDuplicate(post)}
                          disabled={readOnly}
                        >
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      {onPostDelete && (
                        <DropdownMenuItem
                          onClick={() => onPostDelete(post.id)}
                          disabled={readOnly}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}