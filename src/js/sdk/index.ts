import { init_actor } from './declarations/canisters/rust_hello'
import { nanoid } from 'nanoid'
import 'isomorphic-fetch'
import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow'
import { page } from './declarations/canisters/rust_hello/rust_hello.did'

export enum ErrorKind {
    NotFound,
    InvalidInput,
    Internal,
}

export interface ZoniaError {
    kind: ErrorKind,
    message: string,
}

export type ZoniaResult<T> = ResultAsync<T, ZoniaError>

// creates a zonia result object (for testing purposes)
export function createZoniaResult<T>(r: { value?: T, e?: ZoniaError }): ZoniaResult<T> {
    if (r?.value) {
        return okAsync(r.value)
    }
    return errAsync(r.e)
}

type PostID = string

export interface Post {
    id: string,
    content: string,
    created_at: number,
    userId: string,
    replies: Page
}

export type Thread = Array<Post>

export interface Page {
    remainingCount: number,
    thread: Thread
}

export interface RemovePostInput {
    channelId: string,
    postId: string
}

export interface GetThreadInput {
    channelId: string,
    cursor?: string,
    limit?: number
}

export interface UpsertPostInput {
    channelId: string,
    parentId?: string,
    content: string
    postId?: string
}

export interface SDKConfig {
    serverId: string,
    host?: string,
}

export interface SDK {
    getThread: (input: GetThreadInput) => ZoniaResult<Page>,
    upsertPost: (input: UpsertPostInput) => ZoniaResult<PostID>,
    removePost: (input: RemovePostInput) => ZoniaResult<PostID>,
}

export type SDKResult = Result<SDK, ZoniaError>

export type SDKFn = (config: SDKConfig) => SDKResult

const mapActorPageToPage = (page: page): Page => ({
    remainingCount: Number(page.remaining_count),
    thread: page.comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        created_at: Number(comment.created_at),
        userId: comment.user_id,
        replies: mapActorPageToPage(comment.replies)
    }))
})

const sdkFn: SDKFn = (config: SDKConfig): Result<SDK, ZoniaError> => {

    const clientInit = Result.fromThrowable(init_actor)
    const IDGen = () => nanoid(5)

    return clientInit(config.serverId,config?.host)
        .map(client => ({
            upsertPost: (input: UpsertPostInput) => {
                const upsertInput = {
                    channel_id: input.channelId,
                    parent_id: (input.parentId ? [input.parentId] : []) as [string],
                    message: input.content,
                    comment_id: input?.postId ?? IDGen()
                }
                return ResultAsync
                    .fromPromise(client.upsert_comment(upsertInput),
                        error => ({
                            kind: ErrorKind.Internal,
                            message: (error as any)?.message ?? 'Unknown Error'
                        }))
            },
            getThread: (input: GetThreadInput) => {
                const getThreadInput = {
                    channel_id: input.channelId,
                    cursor: (input.cursor ? [input.cursor] : []) as [string],
                    limit: input.limit ?? 10
                }

                return ResultAsync
                    .fromPromise(client.get_thread(getThreadInput),
                        error => ({
                            kind: ErrorKind.Internal,
                            message: (error as any)?.message ?? 'Unknown Error'
                        })
                    ).map(mapActorPageToPage)
            },
            removePost: (input: RemovePostInput) => {
                return ResultAsync
                    .fromPromise(client.delete_comment({
                        channel_id: input.channelId,
                        comment_id: input.postId
                    }), error => ({
                        kind: ErrorKind.Internal,
                        message: (error as any)?.message ?? 'Unknown Error'
                    }))
            }
        }))
        .mapErr(() =>
            ({ kind: ErrorKind.Internal, message: 'Failed to initialize client' }))
}

export default sdkFn