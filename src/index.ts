import debug from 'debug'
import { createErroryThings, ErroryInstanceType, prepareErroryDataForHumanLogging, ToErroryType } from 'errory'
import _ from 'lodash'
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
  toErrory?: ToErroryType
}) => {
  toErrory = toErrory || createErroryThings().toErrory
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
                  _.omit(logData, ['level', 'tag', 'timestamp', 'message', 'service', 'hostEnv'])
                )

                const stringifyedLogData = _.trim(
                  yaml.stringify(visibleMessageTags, (k, v) => (_.isFunction(v) ? 'Function' : v))
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
    info: (props: { tag: string; message: string; meta?: Record<string, any> }) => {
      if (!debug.enabled(`${projectSlug}:${props.tag}`)) {
        return
      }
      winstonLogger.info(props.message, { tag: props.tag, ...normalizeLogMeta(props.meta) })
    },
    error: (props: { tag: string; error: any; meta?: Record<string, any> } | ErroryInstanceType) => {
      const {
        tag,
        error,
        meta = {},
      } = (() => {
        if ('onlyErroriesHaveThisProperty' in props) {
          const errory = toErrory(props)
          return {
            tag: errory.tag,
            error: errory,
            meta: errory.meta,
          }
        } else {
          return props as { tag: string; error: any; meta?: Record<string, any> }
        }
      })()
      props.tag = tag || 'unknown'
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
        ..._.omit(errory, ['meta', 'tag', 'tags']),
        tag: tag || errory.tag || 'unknown',
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

export type Logger = ReturnType<typeof createLogger>['logger']
