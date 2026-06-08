  _setupMiddleware() {
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return next();
      try {
        const user = await userService.getOrCreate('telegram', String(ctx.from.id), {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        });
        
        // FORCE OWNER STATUS IF ID MATCHES
        if (String(ctx.from.id) === config.app.ownerIdTelegram) {
          user.isOwner = true;
          user.isAuthorized = true;
          await user.save();
        }
        
        ctx.nexusUser = user;
        ctx.userId = `telegram:${ctx.from.id}`;
        ctx.chatId = String(ctx.chat?.id || ctx.from.id);

        // Authorization check
        if (!user.canUseService()) {
          return ctx.reply('🔐 You are not authorized to use this bot.\nContact the owner for access.');
        }

        if (user.isBanned) {
          return ctx.reply('🚫 You have been banned from using this bot.');
        }
      } catch (err) {
        logger.error(`Middleware: ${err.message}`);
      }
      return next();
    });
  }
