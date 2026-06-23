import {
  defaultFieldResolver,
  GraphQLArgument,
  GraphQLField,
  GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLSchema,
  isIntrospectionType,
} from 'graphql'
import {
  IApplyOptions,
  IMiddleware,
  IMiddlewareFieldMap,
  IMiddlewareFunction,
  IMiddlewareResolver,
  IResolverOptions,
  IResolvers,
} from './types'
import {
  isGraphQLObjectType,
  isMiddlewareFunction,
  isMiddlewareResolver,
  isMiddlewareWithFragment,
} from './utils'

// Applicator

function wrapResolverInMiddleware<TSource, TContext, TArgs>(
  resolver: GraphQLFieldResolver<any, any, any>,
  middleware: IMiddlewareResolver<TSource, TContext, TArgs>,
): GraphQLFieldResolver<any, any, any> {
  return (parent, args, ctx, info) =>
    middleware(
      (_parent = parent, _args = args, _ctx = ctx, _info = info) =>
        resolver(_parent, _args, _ctx, _info),
      parent,
      args,
      ctx,
      info,
    )
}

function parseField(field: GraphQLField<any, any, any>) {
  const argsMap = Object.fromEntries(
    field.args.map(
      (cur) => [cur.name, cur]
    )
  )
  return {
    ...field,
    args: argsMap,
  }
}

function applyMiddlewareToField<TSource, TContext, TArgs>(
  field: GraphQLField<any, any, any>,
  options: IApplyOptions,
  middleware: IMiddlewareFunction<TSource, TContext, TArgs>,
): IResolverOptions {
  const parsedField = parseField(field)
  if (
    isMiddlewareWithFragment(middleware) &&
    parsedField.resolve &&
    parsedField.resolve !== defaultFieldResolver
  ) {
    return {
      ...parsedField,
      fragment: middleware.fragment,
      fragments: middleware.fragments,
      resolve: wrapResolverInMiddleware(
        parsedField.resolve,
        middleware.resolve,
      ),
    }
  } else if (isMiddlewareWithFragment(middleware) && parsedField.subscribe) {
    return {
      ...parsedField,
      fragment: middleware.fragment,
      fragments: middleware.fragments,
      subscribe: wrapResolverInMiddleware(
        parsedField.subscribe,
        middleware.resolve,
      ),
    }
  } else if (
    isMiddlewareResolver(middleware) &&
    parsedField.resolve &&
    parsedField.resolve !== defaultFieldResolver
  ) {
    return {
      ...parsedField,
      resolve: wrapResolverInMiddleware(parsedField.resolve, middleware),
    }
  } else if (isMiddlewareResolver(middleware) && parsedField.subscribe) {
    return {
      ...parsedField,
      subscribe: wrapResolverInMiddleware(parsedField.subscribe, middleware),
    }
  } else if (
    isMiddlewareWithFragment(middleware) &&
    !options.onlyDeclaredResolvers
  ) {
    return {
      ...parsedField,
      fragment: middleware.fragment,
      fragments: middleware.fragments,
      resolve: wrapResolverInMiddleware(
        defaultFieldResolver,
        middleware.resolve,
      ),
    }
  } else if (
    isMiddlewareResolver(middleware) &&
    !options.onlyDeclaredResolvers
  ) {
    return {
      ...parsedField,
      resolve: wrapResolverInMiddleware(defaultFieldResolver, middleware),
    }
  } else {
    return { ...parsedField, resolve: defaultFieldResolver }
  }
}

function applyMiddlewareToType<TSource, TContext, TArgs>(
  type: GraphQLObjectType,
  options: IApplyOptions,
  middleware:
    | IMiddlewareFunction<TSource, TContext, TArgs>
    | IMiddlewareFieldMap<TSource, TContext, TArgs>,
): Record<string, IResolverOptions> {
  const fieldMap = type.getFields()

  if (isMiddlewareFunction(middleware)) {
    const resolvers = Object.fromEntries(
      Object.entries(fieldMap).map(([fieldName, field]) => [
        fieldName,
        applyMiddlewareToField(
          field,
          options,
          middleware as IMiddlewareFunction<TSource, TContext, TArgs>,
        ),
      ]),
    )

    return resolvers
  } else {
    const resolvers = Object.fromEntries(
      Object.entries(middleware).map(([fieldName, middlewareFn]) => [
        fieldName,
        applyMiddlewareToField(fieldMap[fieldName], options, middlewareFn),
      ]),
    )

    return resolvers
  }
}

function applyMiddlewareToSchema<TSource, TContext, TArgs>(
  schema: GraphQLSchema,
  options: IApplyOptions,
  middleware: IMiddlewareFunction<TSource, TContext, TArgs>,
): IResolvers {
  const typeMap = schema.getTypeMap()

  const resolvers = Object.fromEntries(
    Object.entries(typeMap)
      .filter(
        ([, typeValue]) =>
          isGraphQLObjectType(typeValue) && !isIntrospectionType(typeValue),
      )
      .map(([typeName, type]) => [
        typeName,
        applyMiddlewareToType(
          type as GraphQLObjectType,
          options,
          middleware,
        ),
      ]),
  )

  return resolvers
}

// Generator

export function generateResolverFromSchemaAndMiddleware<
  TSource,
  TContext,
  TArgs,
  >(
    schema: GraphQLSchema,
    options: IApplyOptions,
    middleware: IMiddleware<TSource, TContext, TArgs>,
): IResolvers {
  if (isMiddlewareFunction(middleware)) {
    return applyMiddlewareToSchema(
      schema,
      options,
      middleware as IMiddlewareFunction<TSource, TContext, TArgs>,
    )
  } else {
    const typeMap = schema.getTypeMap()

    const resolvers = Object.fromEntries(
      Object.entries(middleware).map(([typeName, middlewareFn]) => [
        typeName,
        applyMiddlewareToType(
          typeMap[typeName] as GraphQLObjectType,
          options,
          middlewareFn,
        ),
      ]),
    )

    return resolvers
  }
}
