import type { PostComment } from '../../types/moment';

export type LikeRow = {
  id: string;
  memory_id: string;
  user_id: string;
  created_at: string;
};

export type CommentRow = {
  id: string;
  memory_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type MemoryEngagement = {
  likedByUserIds: string[];
  comments: PostComment[];
  likesCount: number;
  commentsCount: number;
};

export function mapCommentRow(
  row: CommentRow,
  postId: string,
  author: { username: string },
): PostComment {
  return {
    id: row.id,
    postId,
    authorId: row.author_id,
    authorName: author.username,
    authorHandle: `@${author.username}`,
    body: row.body,
    createdAt: Date.parse(row.created_at) || Date.now(),
  };
}
