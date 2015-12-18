/**
 * Created by Alex on 12/18/2015.
 */
/*
 User.hasMany(Post,   {as: 'posts',  foreignKey: 'userId'});
 // creates instance methods:
 // user.posts(conds)
 // user.posts.build(data) // like new Post({userId: user.id});
 // user.posts.create(data) // build and save

 Post.belongsTo(User, {as: 'author', foreignKey: 'userId'});
 // creates instance methods:
 // post.author(callback) -- getter when called with function
 // post.author() -- sync getter when called without params
 // post.author(user) -- setter when called with object
 */