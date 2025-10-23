import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface TopPost {
  provider: string;
  external_id: string;
  caption_text: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement_rate: number;
  permalink: string;
  posted_at: string;
}

interface TopPostsTableProps {
  data: TopPost[];
  loading: boolean;
}

export const TopPostsTable = ({ data, loading }: TopPostsTableProps) => {
  const [selectedPost, setSelectedPost] = useState<TopPost | null>(null);

  const exportToCSV = () => {
    if (!data || data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Platform", "Caption", "Likes", "Comments", "Shares", "Views", "Engagement Rate", "Permalink"];
    const rows = data.map(post => [
      post.provider,
      `"${(post.caption_text || "").replace(/"/g, '""')}"`,
      post.likes,
      post.comments,
      post.shares,
      post.views,
      `${post.engagement_rate.toFixed(2)}%`,
      post.permalink
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-posts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle>Top Performing Posts</CardTitle>
            <CardDescription>
              Your best posts ranked by engagement rate
            </CardDescription>
          </div>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Caption</TableHead>
                  <TableHead className="text-right">Likes</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">ER %</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No posts data available yet. Connect your social accounts and publish some content!
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((post, index) => {
                    const isTrending = post.engagement_rate > 5;
                    const truncatedCaption = post.caption_text?.length > 50 
                      ? post.caption_text.substring(0, 50) + "..." 
                      : post.caption_text || "No caption";

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {post.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{truncatedCaption}</span>
                            {isTrending && (
                              <Badge variant="destructive" className="shrink-0">
                                🔥 Trending
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {post.likes.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {post.comments.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {post.shares.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {post.views.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={isTrending ? "default" : "secondary"}>
                            {post.engagement_rate.toFixed(2)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPost(post)}
                            >
                              <TrendingUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post Details</DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Platform</h3>
                <Badge variant="outline">{selectedPost.provider}</Badge>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Caption</h3>
                <p className="text-sm text-muted-foreground">{selectedPost.caption_text || "No caption"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Engagement Metrics</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Likes:</span>
                      <span className="font-medium">{selectedPost.likes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comments:</span>
                      <span className="font-medium">{selectedPost.comments.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shares:</span>
                      <span className="font-medium">{selectedPost.shares.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Views:</span>
                      <span className="font-medium">{selectedPost.views.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Performance</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Engagement Rate:</span>
                      <span className="font-medium">{selectedPost.engagement_rate.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posted:</span>
                      <span className="font-medium">{new Date(selectedPost.posted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4">
                <Button asChild className="w-full">
                  <a href={selectedPost.permalink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Original Post
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
