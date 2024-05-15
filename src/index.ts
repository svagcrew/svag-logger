import debug from 'debug'
import { ErroryType, prepareErroryDataForHumanLogging, ToErroryType } from 'errory'
import { isFunction, omit, trim } from 'lodash'
import { EOL } from 'os'
import pc from 'picocolors'
import { deepMap } from 'svag-deep-map'
import { MESSAGE } from 'triple-beam'
import winston from 'winston'
import * as yaml from 'yaml'

export const createLogger = ({
  projectSlug,
  format,
  toErrory,
  defaultMeta = {},
  sensetiveKeys = [
    'email',
    'oldEmail',
    'newEmail',
    'phone',
    'oldPhone',
    'newPhone',
    'password',
    'newPassword',
    'oldPassword',
    'token',
    'apiKey',
    'verifcationCode',
    'signature',
    'signedUrl',
  ],
}: {
  projectSlug: string
  format: 'json' | 'human-yaml'
  defaultMeta?: Record<string, any>
  sensetiveKeys?: string[]
  toErrory: ToErroryType
}) => {
  const winstonLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta,
    transports: [
      new winston.transports.Console({
        format:
          format === 'json'
            ? winston.format.json()
            : winston.format((logData) => {
                const setColor = {
                  info: (str: string) => pc.blue(str),
                  error: (str: string) => pc.red(str),
                  debug: (str: string) => pc.cyan(str),
                }[logData.level as 'info' | 'error' | 'debug']
                const levelAndType = `${logData.level} ${logData.tag}`
                const topMessage = `${setColor(levelAndType)} ${pc.green(logData.timestamp)}${EOL}${logData.message}`

                const visibleMessageTags = prepareErroryDataForHumanLogging(
                  omit(logData, ['level', 'tag', 'tags', 'timestamp', 'message', 'service', 'hostEnv'])
                )

                const stringifyedLogData = trim(
                  yaml.stringify(visibleMessageTags, (k, v) => (isFunction(v) ? 'Function' : v))
                )

                const resultLogData = {
                  ...logData,
                  [MESSAGE]:
                    [topMessage, Object.keys(visibleMessageTags).length > 0 ? `${EOL}${stringifyedLogData}` : '']
                      .filter(Boolean)
                      .join('') + EOL,
                }

                return resultLogData
              })(),
      }),
    ],
  })

  const normalizeLogMeta = <T = Record<string, any> | undefined>(meta: T) => {
    return deepMap<T>(meta || {}, ({ key, value }) => {
      if (sensetiveKeys.includes(key)) {
        return '🙈'
      }
      // const stringValue = value?.toString()
      // if (stringValue && !stringValue.includes('[object Object]')) {
      //   return stringValue
      // }
      return value
    })
  }

  const logger = {
    info: (tag: string, message: string, meta?: Record<string, any>) => {
      if (!debug.enabled(`${projectSlug}:${tag}`) || meta?.query?.includes?.('TestCreatedAtLog')) {
        return
      }
      winstonLogger.info(message, { tag, ...normalizeLogMeta(meta) })
    },
    error: (props: { tag: string; tags: string[]; error: any; meta?: Record<string, any> } | ErroryType) => {
      const {
        tag,
        tags,
        error,
        meta = {},
      } = (() => {
        if ('onlyErroriesHaveThisProperty' in props) {
          const errory = toErrory(props)
          return {
            tag: errory.tag || 'unknown',
            tags: errory.tags,
            error: errory,
            meta: errory.meta,
          }
        } else {
          return props as { tag: string; tags: string[]; error: any; meta?: Record<string, any> }
        }
      })()
      // if (!originalError.expected) {
      //   sentryCaptureException(error)
      // }
      if (!debug.enabled(`${projectSlug}:${tag}`)) {
        return
      }
      // const axiosError =
      //   error instanceof AxiosError
      //     ? error
      //     : error instanceof TRPCError && error.cause instanceof AxiosError
      //       ? error.cause
      //       : undefined
      // if (axiosError) {
      //   meta.axiosData = axiosError.response?.data
      //   meta.axiosStatus = axiosError.response?.status
      // }
      const errory = toErrory(error)
      winstonLogger.error(errory.message || 'Unknown error', {
        ...omit(errory, ['meta', 'tag', 'tags']),
        tag: tag || errory.tag || 'unknown',
        tags: tags || errory.tags || ['unknown'],
        ...normalizeLogMeta(meta),
        stack: errory.stack || error.stack,
      })
    },
  }

  return {
    logger,
    winstonLogger,
  }
}
