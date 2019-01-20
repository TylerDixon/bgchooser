import React, { SFC } from 'react';
import classnames from 'classnames';
import style from './loading.module.scss'

interface LoadingProps {
  className?: string;
}

const Loading: SFC<LoadingProps> = (props) => {
  return <div className={classnames(style.loading, props.className)}></div>;
}

Loading.defaultProps = {
  className: ""
};

export default Loading;