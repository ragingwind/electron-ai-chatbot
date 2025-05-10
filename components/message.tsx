'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, startTransition, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { APPROVAL, cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { useChat, UseChatHelpers } from '@ai-sdk/react';
import { ToolContentCall } from './tool-content';
import { ToolPermissionRequest } from './tool-permission-request';
import type { ToolMetadata } from '../lib/ai/tools';
import { Calculator } from './calculator';
import { PokemonCarousel } from './pokemon-carousel';
import useSWR from 'swr';

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  addToolResult,
  reload,
  isReadonly,
  tools,
  setInput,
}: {
  chatId: string;
  message: UIMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers['setMessages'];
  addToolResult?: ReturnType<typeof useChat>['addToolResult'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  tools?: Record<string, ToolMetadata>;
  setInput?: UseChatHelpers['setInput'];
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const { data, mutate } = useSWR<Record<string, any>>(`/chat/${chatId}`);

  const handleApproveResult = ({
    toolName,
    toolCallId,
    result,
    always,
  }: {
    toolName: string;
    toolCallId: string;
    result: any;
    always?: boolean;
  }) => {
    addToolResult?.({
      toolCallId,
      result,
    });

    if (always) {
      mutate({
        ...data,
        approved: [...(data?.approved ?? []), toolName],
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div>
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row justify-end gap-2"
              >
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'reasoning') {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.reasoning}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <div
                        data-testid="message-content"
                        className={cn('flex flex-col gap-4', {
                          'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                            message.role === 'user',
                        })}
                      >
                        <Markdown>{part.text}</Markdown>
                      </div>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        reload={reload}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-invocation') {
                const { toolInvocation } = part;
                const { toolName, toolCallId, state } = toolInvocation;
                const tool = tools?.[toolName];

                console.log('toolInvocation', toolName, toolInvocation);
                if (state === 'call') {
                  const { args } = toolInvocation;

                  if (tool?.capabilities === 'executable') {
                    // If the tool was allowed to execute before, we don't need to ask for permission again
                    if (
                      data?.approved &&
                      data?.approved?.indexOf(toolName) !== -1
                    ) {
                      // return addToolResult directly cause component rendering conflict
                      setTimeout(() => {
                        startTransition(() => {
                          addToolResult?.({
                            toolCallId,
                            result: APPROVAL.YES,
                          });
                        });
                      }, 100);
                      return;
                    }

                    return (
                      <ToolPermissionRequest
                        key={toolCallId}
                        args={args}
                        toolName={toolName}
                        description={tool?.description ?? ''}
                        onAllowOnceAction={() => {
                          handleApproveResult({
                            toolName,
                            toolCallId,
                            result: APPROVAL.YES,
                          });
                        }}
                        onAllowAlwaysAction={() => {
                          handleApproveResult({
                            toolName,
                            toolCallId,
                            always: true,
                            result: APPROVAL.YES,
                          });
                        }}
                        onDenyAction={() => {
                          handleApproveResult({
                            toolName,
                            toolCallId,
                            result: APPROVAL.NO,
                          });
                        }}
                      />
                    );
                  }

                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : (
                        <ToolContentCall
                          state={state}
                          toolName={toolName}
                          args={args}
                        />
                      )}
                    </div>
                  );
                }

                if (state === 'result') {
                  const { result, args } = toolInvocation;

                  return (
                    <div key={toolCallId}>
                      {toolName === 'getWeather' ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          result={result}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'calculator' ? (
                        <Calculator key={toolCallId} args={args} />
                      ) : toolName === 'pokemons_query' ? (
                        <PokemonCarousel
                          result={result}
                          onClickPokemon={(poketmon) => {
                            setInput?.(
                              () =>
                                `I would like to know more about ${poketmon.name} (${poketmon.id})`,
                            );
                          }}
                        />
                      ) : (
                        <ToolContentCall // @FIXME: change name to ToolContentResult thenm remote state
                          state={state}
                          args={args}
                          result={result}
                          toolName={toolName}
                          isLoading={isLoading}
                        />
                      )}
                    </div>
                  );
                }
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (!equal(prevProps.tools, nextProps.tools)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
