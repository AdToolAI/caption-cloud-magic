import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Top Performing Posts
        </CardTitle>
        <CardDescription>
          Your best content by engagement rate (last 30 days)
        </CardDescription>
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
                <TableHead className="text-right">Link</TableHead>
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
                        {post.permalink ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                          >
                            <a 
                              href={post.permalink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              aria-label="View post"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        )}
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
  );
};
